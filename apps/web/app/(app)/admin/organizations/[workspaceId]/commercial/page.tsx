import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import {
  AesGcmAdminEmailSecretCrypto,
  currentAdminEmailEnvironment,
} from '../../../../../../src/email/secure-admin-email-configuration';
import {
  CommercialBillingRecipientTestResend,
  CommercialBillingReminderResend,
} from '../../../../../../src/email/commercial-billing-reminder';
import { currentPlatformBillingIssuer } from '../../../../../../src/commercial-invoice-document';
import { CommercialAdminDashboard } from './commercial-admin-dashboard';

export const dynamic = 'force-dynamic';

const workspaceSchema = z.object({ workspaceId: z.uuid() });
const contractSchema = z.object({
  workspaceId: z.uuid(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED']),
  billingMode: z.enum(['MANUAL_INVOICE', 'EXTERNAL_BILLING']),
  billingName: z.string().trim().min(1).max(200),
  billingEmail: z.email().max(320),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  reminderLeadDays: z.coerce.number().int().min(0).max(30),
  overdueReminderIntervalDays: z.coerce.number().int().min(1).max(30),
  automaticRemindersEnabled: z
    .string()
    .optional()
    .transform((value) => value === 'on'),
  automaticCollectionEnabled: z
    .string()
    .optional()
    .transform((value) => value === 'on'),
  externalCustomerReference: z.string().trim().max(200).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});
const invoiceActionSchema = z.object({
  workspaceId: z.uuid(),
  invoiceId: z.uuid(),
  action: z.enum(['ISSUE', 'MARK_PAID', 'VOID']),
  externalInvoiceReference: z.string().trim().max(200).optional(),
  paymentReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});
const customQuoteSchema = z.object({
  workspaceId: z.uuid(),
  monthlyUsageId: z.uuid(),
  amountYen: z.coerce.number().int().positive().max(1_000_000_000),
  notes: z.string().trim().max(1000).optional(),
});
const reminderSchema = z.object({ workspaceId: z.uuid(), invoiceId: z.uuid() });
const recipientTestSchema = z.object({ workspaceId: z.uuid() });

function optionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime())) throw new Error('invalid date');
  return date;
}

async function requireSuperAdmin() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  return { actor, db };
}

async function finalizePreviousMonth(formData: FormData) {
  'use server';
  const input = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialUsageService().finalizePreviousMonth(input.data.workspaceId);
    await new db.PrismaCommercialBillingService().prepareWorkspaceInvoices(input.data.workspaceId);
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=finalize`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?finalized=1`);
}

async function saveContract(formData: FormData) {
  'use server';
  const input = contractSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialBillingService().saveContract({
      ...input.data,
      actorUserId: actor.userId,
      externalCustomerReference: input.data.externalCustomerReference || null,
      startsAt: optionalDate(input.data.startsAt),
      endsAt: optionalDate(input.data.endsAt),
    });
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=contract`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?contractSaved=1`);
}

async function prepareInvoices(formData: FormData) {
  'use server';
  const input = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { db } = await requireSuperAdmin();
  await new db.PrismaCommercialBillingService().prepareWorkspaceInvoices(input.data.workspaceId);
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?prepared=1`);
}

async function transitionInvoice(formData: FormData) {
  'use server';
  const input = invoiceActionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialBillingService().transitionInvoice({
      workspaceId: input.data.workspaceId,
      invoiceId: input.data.invoiceId,
      action: input.data.action,
      actorUserId: actor.userId,
      externalInvoiceReference: input.data.externalInvoiceReference ?? null,
      paymentReference: input.data.paymentReference ?? null,
      notes: input.data.notes ?? null,
      ...(input.data.action === 'ISSUE' ? { documentIssuer: currentPlatformBillingIssuer() } : {}),
    });
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=invoice`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?invoiceUpdated=1`);
}

async function prepareCustomQuoteInvoice(formData: FormData) {
  'use server';
  const input = customQuoteSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialBillingService().prepareCustomQuoteInvoice({
      ...input.data,
      actorUserId: actor.userId,
      notes: input.data.notes || null,
    });
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=customQuote`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  revalidatePath('/admin/commercial-billing');
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?customQuoteSaved=1`);
}

async function sendInvoiceReminder(formData: FormData) {
  'use server';
  const input = reminderSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  const returnPath = `/admin/organizations/${input.data.workspaceId}/commercial` as Route;
  const now = new Date();
  const invoice = await db.prisma.tenantInvoice.findFirst({
    where: {
      id: input.data.invoiceId,
      workspaceId: input.data.workspaceId,
      status: 'ISSUED',
      dueAt: { not: null },
    },
    select: {
      id: true,
      invoiceNumber: true,
      amountYen: true,
      dueAt: true,
      checkoutUrl: true,
      checkoutExpiresAt: true,
      contract: { select: { billingName: true, billingEmail: true } },
    },
  });
  if (!invoice?.dueAt) redirect(`${returnPath}?error=reminder-target` as Route);
  const repository = new db.PrismaAdminEmailConfigurationRepository();
  const configuration = await repository.active({ environment: currentAdminEmailEnvironment() });
  if (!configuration) redirect(`${returnPath}?error=reminder-email` as Route);
  const overdue = invoice.dueAt < now;
  const reminderKind = overdue ? 'OVERDUE' : 'INITIAL';
  const localDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  try {
    await new CommercialBillingReminderResend().send({
      apiKey: new AesGcmAdminEmailSecretCrypto().decrypt(configuration.encryptedApiKey),
      from: configuration.configuration.fromEmail,
      to: invoice.contract.billingEmail,
      invoiceNumber: invoice.invoiceNumber,
      billingName: invoice.contract.billingName,
      amountYen: invoice.amountYen,
      dueAt: invoice.dueAt,
      checkoutUrl:
        invoice.checkoutUrl && invoice.checkoutExpiresAt && invoice.checkoutExpiresAt > now
          ? invoice.checkoutUrl
          : null,
      overdue,
      idempotencyKey: `commercial-${invoice.id}-${reminderKind}-${localDate}`,
    });
    await db.prisma.commercialBillingAudit.create({
      data: {
        workspaceId: input.data.workspaceId,
        actorUserId: actor.userId,
        entityType: 'INVOICE',
        entityId: invoice.id,
        action: overdue ? 'OVERDUE_REMINDER_SENT' : 'PAYMENT_GUIDANCE_SENT',
        afterData: {
          recipient: invoice.contract.billingEmail,
          reminderKind,
          sentAt: now.toISOString(),
        },
      },
    });
  } catch {
    redirect(`${returnPath}?error=reminder-send` as Route);
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?reminderSent=1` as Route);
}

async function sendBillingRecipientTest(formData: FormData) {
  'use server';
  const input = recipientTestSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  const returnPath = `/admin/organizations/${input.data.workspaceId}/commercial` as Route;
  const contract = await db.prisma.organizationCommercialContract.findUnique({
    where: { workspaceId: input.data.workspaceId },
    select: { id: true, billingName: true, billingEmail: true },
  });
  if (!contract) redirect(`${returnPath}?error=recipient-test-target` as Route);
  const repository = new db.PrismaAdminEmailConfigurationRepository();
  const configuration = await repository.active({ environment: currentAdminEmailEnvironment() });
  if (!configuration) redirect(`${returnPath}?error=recipient-test-email` as Route);
  const now = new Date();
  const localDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  try {
    await new CommercialBillingRecipientTestResend().send({
      apiKey: new AesGcmAdminEmailSecretCrypto().decrypt(configuration.encryptedApiKey),
      from: configuration.configuration.fromEmail,
      to: contract.billingEmail,
      billingName: contract.billingName,
      idempotencyKey: `commercial-recipient-test-${contract.id}-${localDate}`,
    });
    await db.prisma.commercialBillingAudit.create({
      data: {
        workspaceId: input.data.workspaceId,
        actorUserId: actor.userId,
        entityType: 'CONTRACT',
        entityId: contract.id,
        action: 'BILLING_EMAIL_TEST_SENT',
        afterData: { recipient: contract.billingEmail, sentAt: now.toISOString() },
      },
    });
  } catch {
    await db.prisma.commercialBillingAudit
      .create({
        data: {
          workspaceId: input.data.workspaceId,
          actorUserId: actor.userId,
          entityType: 'CONTRACT',
          entityId: contract.id,
          action: 'BILLING_EMAIL_TEST_FAILED',
          afterData: { recipient: contract.billingEmail, failedAt: now.toISOString() },
        },
      })
      .catch(() => undefined);
    redirect(`${returnPath}?error=recipient-test-send` as Route);
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?recipientTestSent=1` as Route);
}

export default async function OrganizationCommercialPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    finalized?: string;
    error?: string;
    contractSaved?: string;
    prepared?: string;
    invoiceUpdated?: string;
    customQuoteSaved?: string;
    reminderSent?: string;
    recipientTestSent?: string;
  }>;
}) {
  const workspaceId = z.uuid().safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const [{ db }, query] = await Promise.all([requireSuperAdmin(), searchParams]);
  const [dashboard, billing] = await Promise.all([
    new db.PrismaCommercialUsageService().dashboard(workspaceId.data),
    new db.PrismaCommercialBillingService().dashboard(workspaceId.data),
  ]);
  if (!dashboard || !billing) notFound();
  const latestReminderEvents = new Map<string, (typeof billing.commercialBillingAudits)[number]>();
  for (const audit of billing.commercialBillingAudits) {
    const reminderKind = audit.action.startsWith('PAYMENT_GUIDANCE_')
      ? 'INITIAL'
      : audit.action.startsWith('OVERDUE_REMINDER_')
        ? 'OVERDUE'
        : null;
    if (!reminderKind) continue;
    const key = `${audit.entityId}:${reminderKind}`;
    if (!latestReminderEvents.has(key)) latestReminderEvents.set(key, audit);
  }
  const reminderFailures = [...latestReminderEvents.values()].filter((audit) =>
    audit.action.endsWith('_FAILED'),
  );

  return (
    <CommercialAdminDashboard
      dashboard={dashboard}
      billing={billing}
      query={query}
      reminderFailures={reminderFailures}
      actions={{
        finalizePreviousMonth,
        saveContract,
        prepareInvoices,
        transitionInvoice,
        prepareCustomQuoteInvoice,
        sendInvoiceReminder,
        sendBillingRecipientTest,
      }}
    />
  );
}
