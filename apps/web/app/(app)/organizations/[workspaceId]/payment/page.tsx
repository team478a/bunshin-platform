import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { getServerEnvironment } from '@bunshin/config';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  StripeAccountConnectionTestAdapter,
} from '../../../../../src/payments/secure-configuration';
import { netPaidAmount } from '../../../../../src/payments/payment-operations';
import { recoverFailedPaymentWebhook } from '../../../../../src/payments/payment-webhook-recovery';
import { reconcilePendingProgramPurchase } from '../../../../../src/payments/payment-checkout-reconciliation';
import { OrganizationPaymentDashboard } from './organization-payment-dashboard';
import { OrganizationPaymentOperations } from './organization-payment-operations';
import { OrganizationPaymentSettings } from './organization-payment-settings';

export const dynamic = 'force-dynamic';

const saveSchema = z.object({
  workspaceId: z.uuid(),
  secretKey: z.string().trim().max(2000).optional(),
  webhookSecret: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(3).max(500),
});
const actionSchema = z.object({ workspaceId: z.uuid(), reason: z.string().trim().min(3).max(500) });
const webhookRecoverySchema = actionSchema.extend({ webhookEventId: z.uuid() });
const purchaseReconciliationSchema = actionSchema.extend({ purchaseId: z.uuid() });

async function requirePaymentManager(workspaceId: string, userId: string) {
  const db = await import('@bunshin/database');
  const [workspace, platformAdmin, membership] = await Promise.all([
    db.prisma.workspace.findFirst({
      where: { id: workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' },
      select: { id: true, name: true },
    }),
    new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(userId),
    db.prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    }),
  ]);
  if (!workspace || (!platformAdmin && !membership)) notFound();
  return { db, workspace };
}

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

function paymentPath(workspaceId: string, result?: string): Route {
  return `/organizations/${workspaceId}/payment${result ? `?result=${result}` : ''}` as Route;
}

async function saveConfiguration(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = saveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-setting');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const environment = currentPaymentEnvironment();
  const current = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment,
        provider: 'STRIPE',
      },
    },
  });
  const secretKey = parsed.data.secretKey || null;
  const webhookSecret = parsed.data.webhookSecret || null;
  if (!current && !secretKey)
    redirect(paymentPath(parsed.data.workspaceId, 'credentials-required'));
  if (secretKey && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey))
    redirect(paymentPath(parsed.data.workspaceId, 'invalid-secret-key'));
  if (webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret))
    redirect(paymentPath(parsed.data.workspaceId, 'invalid-webhook-secret'));

  const crypto = new AesGcmPaymentSecretCrypto();
  const encryptedSecret = secretKey ? crypto.encrypt(secretKey) : null;
  const encryptedWebhook = webhookSecret ? crypto.encrypt(webhookSecret) : null;
  await db.prisma.$transaction(async (tx) => {
    const configuration = current
      ? await tx.organizationPaymentConfiguration.update({
          where: { id: current.id },
          data: {
            ...(encryptedSecret
              ? {
                  encryptedSecretKey: encryptedSecret.encryptedValue,
                  secretKeyMask: encryptedSecret.mask,
                  keyVersion: encryptedSecret.keyVersion,
                }
              : {}),
            ...(encryptedWebhook
              ? {
                  encryptedWebhookSecret: encryptedWebhook.encryptedValue,
                  webhookSecretMask: encryptedWebhook.mask,
                  keyVersion: encryptedWebhook.keyVersion,
                }
              : {}),
            status: 'DRAFT',
            accountReference: null,
            lastVerifiedAt: null,
            lastErrorCategory: null,
            updatedByUserId: user.userId,
          },
        })
      : await tx.organizationPaymentConfiguration.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            environment,
            provider: 'STRIPE',
            encryptedSecretKey: encryptedSecret!.encryptedValue,
            secretKeyMask: encryptedSecret!.mask,
            encryptedWebhookSecret: encryptedWebhook?.encryptedValue ?? null,
            webhookSecretMask: encryptedWebhook?.mask ?? null,
            keyVersion: encryptedSecret!.keyVersion,
            updatedByUserId: user.userId,
          },
        });
    await tx.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: current ? 'UPDATE_CREDENTIALS' : 'CREATE',
        reason: parsed.data.reason,
        changedFields: [
          ...(encryptedSecret ? ['secretKey'] : []),
          ...(encryptedWebhook ? ['webhookSecret'] : []),
          'status',
        ],
      },
    });
  });
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, 'saved'));
}

async function testConnection(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const configuration = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
      },
    },
  });
  if (!configuration) notFound();
  const secretKey = new AesGcmPaymentSecretCrypto().decrypt(configuration.encryptedSecretKey);
  const result = await new StripeAccountConnectionTestAdapter().validate(secretKey);
  await db.prisma.$transaction([
    db.prisma.organizationPaymentConfiguration.update({
      where: { id: configuration.id },
      data: {
        status: result.success ? 'VERIFIED' : 'ERROR',
        accountReference: result.accountReference,
        lastVerifiedAt: new Date(),
        lastErrorCategory: result.errorCategory,
        updatedByUserId: user.userId,
      },
    }),
    db.prisma.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: 'CONNECTION_TEST',
        reason: parsed.data.reason,
        changedFields: ['status', 'accountReference', 'lastVerifiedAt', 'lastErrorCategory'],
      },
    }),
  ]);
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(
    paymentPath(parsed.data.workspaceId, result.success ? 'verified' : 'verification-failed'),
  );
}

async function setActive(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const configuration = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
      },
    },
  });
  if (!configuration) notFound();
  if (
    configuration.status !== 'VERIFIED' ||
    !configuration.lastVerifiedAt ||
    configuration.lastErrorCategory ||
    !configuration.encryptedWebhookSecret
  )
    redirect(
      paymentPath(
        parsed.data.workspaceId,
        configuration.encryptedWebhookSecret ? 'verification-required' : 'webhook-required',
      ),
    );
  await db.prisma.$transaction([
    db.prisma.organizationPaymentConfiguration.update({
      where: { id: configuration.id },
      data: { status: 'ACTIVE', updatedByUserId: user.userId },
    }),
    db.prisma.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: 'ACTIVATE',
        reason: parsed.data.reason,
        changedFields: ['status'],
      },
    }),
  ]);
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, 'activated'));
}

async function pauseConfiguration(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const configuration = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
      },
    },
  });
  if (!configuration) notFound();
  await db.prisma.$transaction([
    db.prisma.organizationPaymentConfiguration.update({
      where: { id: configuration.id },
      data: { status: 'DISABLED', updatedByUserId: user.userId },
    }),
    db.prisma.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: 'DISABLE',
        reason: parsed.data.reason,
        changedFields: ['status'],
      },
    }),
  ]);
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, 'disabled'));
}

async function recoverWebhook(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = webhookRecoverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  let result = 'webhook-recovered';
  try {
    await recoverFailedPaymentWebhook(db.prisma, {
      workspaceId: parsed.data.workspaceId,
      webhookEventId: parsed.data.webhookEventId,
      actorUserId: user.userId,
      reason: parsed.data.reason,
    });
  } catch {
    result = 'webhook-recovery-failed';
  }
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, result));
}

async function reconcilePurchase(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = purchaseReconciliationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  let result = 'payment-reconciliation-failed';
  try {
    const outcome = await reconcilePendingProgramPurchase(db.prisma, {
      workspaceId: parsed.data.workspaceId,
      purchaseId: parsed.data.purchaseId,
      actorUserId: user.userId,
      reason: parsed.data.reason,
    });
    result = `payment-reconciled-${outcome.toLowerCase()}`;
  } catch {
    // The provider error and credentials remain server-side. The operator receives an actionable summary.
  }
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, result));
}

export default async function OrganizationPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const user = await actor();
  const workspaceId = z.uuid().safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const { db, workspace } = await requirePaymentManager(workspaceId.data, user.userId);
  const [
    configuration,
    recentPurchases,
    purchaseCounts,
    paidAmounts,
    failedWebhookEvents,
    failedWebhookCount,
  ] = await Promise.all([
    db.prisma.organizationPaymentConfiguration.findUnique({
      where: {
        workspaceId_environment_provider: {
          workspaceId: workspace.id,
          environment: currentPaymentEnvironment(),
          provider: 'STRIPE',
        },
      },
      select: {
        id: true,
        status: true,
        accountReference: true,
        secretKeyMask: true,
        webhookSecretMask: true,
        lastVerifiedAt: true,
        lastErrorCategory: true,
        updatedAt: true,
      },
    }),
    db.prisma.programPurchase.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        groupId: true,
        status: true,
        amountYen: true,
        refundedAmountYen: true,
        disputedAmountYen: true,
        disputeStatus: true,
        createdAt: true,
        paidAt: true,
        expiredAt: true,
        refundedAt: true,
        disputedAt: true,
        disputeResolvedAt: true,
        buyer: { select: { displayName: true, email: true } },
      },
    }),
    db.prisma.programPurchase.groupBy({
      by: ['status'],
      where: { workspaceId: workspace.id },
      _count: { _all: true },
    }),
    db.prisma.programPurchase.aggregate({
      where: { workspaceId: workspace.id, paidAt: { not: null } },
      _sum: { amountYen: true, refundedAmountYen: true, disputedAmountYen: true },
    }),
    db.prisma.paymentWebhookEvent.findMany({
      where: { workspaceId: workspace.id, status: 'FAILED' },
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        errorCategory: true,
        receivedAt: true,
      },
    }),
    db.prisma.paymentWebhookEvent.count({
      where: { workspaceId: workspace.id, status: 'FAILED' },
    }),
  ]);
  const groupIds = [...new Set(recentPurchases.map((purchase) => purchase.groupId))];
  const groups =
    groupIds.length === 0
      ? []
      : await db.prisma.group.findMany({
          where: { workspaceId: workspace.id, id: { in: groupIds } },
          select: { id: true, name: true },
        });
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const countByStatus = new Map(purchaseCounts.map((row) => [row.status, row._count._all]));
  const waitingPurchaseCount =
    (countByStatus.get('CREATED') ?? 0) + (countByStatus.get('CHECKOUT_OPEN') ?? 0);
  const paidPurchaseCount = countByStatus.get('PAID') ?? 0;
  const refundedPurchaseCount = countByStatus.get('REFUNDED') ?? 0;
  const disputedPurchaseCount = countByStatus.get('DISPUTED') ?? 0;
  const chargebackLostPurchaseCount = countByStatus.get('CHARGEBACK_LOST') ?? 0;
  const grossAmountYen = paidAmounts._sum.amountYen ?? 0;
  const refundedAmountYen = paidAmounts._sum.refundedAmountYen ?? 0;
  const disputedAmountYen = paidAmounts._sum.disputedAmountYen ?? 0;
  const netAmountYen = netPaidAmount(grossAmountYen, refundedAmountYen, disputedAmountYen);
  const result = (await searchParams).result;
  const webhookUrl = configuration
    ? new URL(
        `/api/payments/stripe/${configuration.id}/webhook`,
        getServerEnvironment().APP_URL,
      ).toString()
    : null;

  const purchases = recentPurchases.map(({ groupId, ...purchase }) => ({
    ...purchase,
    groupName: groupNames.get(groupId) ?? '削除済みのサービス',
  }));

  return (
    <main className="app-page">
      <OrganizationPaymentDashboard
        workspace={workspace}
        configuration={configuration}
        result={result}
      />
      <OrganizationPaymentOperations
        workspaceId={workspace.id}
        summary={{
          failedWebhookCount,
          waitingPurchaseCount,
          disputedPurchaseCount,
          paidPurchaseCount,
          refundedPurchaseCount,
          chargebackLostPurchaseCount,
          grossAmountYen,
          refundedAmountYen,
          disputedAmountYen,
          netAmountYen,
        }}
        recentPurchases={purchases}
        failedWebhookEvents={failedWebhookEvents}
        reconcilePurchase={reconcilePurchase}
        recoverWebhook={recoverWebhook}
      />
      <OrganizationPaymentSettings
        workspaceId={workspace.id}
        configuration={configuration}
        webhookUrl={webhookUrl}
        saveConfiguration={saveConfiguration}
        testConnection={testConnection}
        setActive={setActive}
        pauseConfiguration={pauseConfiguration}
      />
    </main>
  );
}
