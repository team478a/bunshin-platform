import 'server-only';

import { randomUUID } from 'node:crypto';
import { fortuneDeepReadingEnabled } from '@bunshin/capability-fortune';
import type { Prisma, PrismaClient } from '@bunshin/database';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  StripeCheckoutAdapter,
} from '../payments/secure-configuration';

export type FortuneCommerceScope = { workspaceId: string; groupId: string };
type Db = PrismaClient | Prisma.TransactionClient;

export const fortuneProductForm = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  deliveryTerms: z.string().trim().min(1).max(500),
  refundTerms: z.string().trim().min(1).max(500),
  amountYen: z.coerce.number().int().min(50).max(99_999_999),
  followUpLimit: z.coerce.number().int().min(0).max(2),
  enabled: z.boolean(),
});

export async function updateFortuneProduct(
  db: PrismaClient,
  scope: FortuneCommerceScope,
  form: unknown,
) {
  const product = fortuneProductForm.parse(form);
  const setting = await db.fortuneServiceSetting.findFirst({ where: scope, select: { id: true } });
  if (!setting) throw new ApplicationError('NOT_FOUND', '占い設定を確認できません。');
  const data = { ...product, revision: randomUUID() };
  return db.fortuneCommerceProduct.upsert({
    where: { serviceSettingId: setting.id },
    create: { ...scope, ...data, serviceSettingId: setting.id },
    update: data,
  });
}

export function fortunePurchaseHistory(
  db: PrismaClient,
  scope: FortuneCommerceScope,
  buyerUserId?: string,
) {
  return db.fortuneCommercePurchase.findMany({
    where: { ...scope, ...(buyerUserId ? { buyerUserId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      status: true,
      productName: true,
      amountYen: true,
      refundedAmountYen: true,
      createdAt: true,
      deliveredAt: true,
      readingId: true,
      liveMode: true,
      paymentFailedAt: true,
      description: true,
      deliveryTerms: true,
      refundTerms: true,
      followUpLimit: true,
    },
  });
}

export async function availableFortuneProduct(
  db: Db,
  scope: FortuneCommerceScope,
  buyerUserId: string,
) {
  const [product, legal, payment] = await Promise.all([
    db.fortuneCommerceProduct.findFirst({
      where: {
        ...scope,
        enabled: true,
        serviceSetting: {
          enabled: true,
          aiEnabled: true,
          personalProfileEnabled: true,
          bunshin: {
            status: 'ACTIVE',
            capabilityAssignments: { some: { capabilityType: 'FORTUNE', status: 'ACTIVE' } },
          },
          participants: {
            some: {
              userId: buyerUserId,
              groupMembership: {
                serviceRole: 'PARTICIPANT',
                status: 'ACTIVE',
                consentedAt: { not: null },
              },
            },
          },
        },
      },
      include: {
        serviceSetting: {
          select: {
            guidanceSettings: true,
            participants: { where: { userId: buyerUserId }, select: { groupMembershipId: true } },
          },
        },
      },
    }),
    db.serviceLegalDocument.findMany({
      where: {
        ...scope,
        type: { in: ['TERMS', 'PRIVACY', 'COMMERCE_DISCLOSURE'] },
        status: 'PUBLISHED',
        effectiveAt: { lte: new Date() },
      },
      select: { type: true },
    }),
    db.organizationPaymentConfiguration.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        encryptedWebhookSecret: { not: null },
      },
    }),
  ]);
  const groupMembershipId = product?.serviceSetting.participants[0]?.groupMembershipId;
  if (
    !product ||
    !groupMembershipId ||
    !payment ||
    new Set(legal.map(({ type }) => type)).size !== 3 ||
    !fortuneDeepReadingEnabled(product.serviceSetting.guidanceSettings)
  )
    return null;
  return { product, payment, groupMembershipId };
}

export async function startFortuneCheckout(
  db: PrismaClient,
  scope: FortuneCommerceScope & { buyerUserId: string; serviceSlug: string },
  input: { revision: string; purchaseId: string },
) {
  const { workspaceId, groupId, buyerUserId, serviceSlug } = scope;
  const target = await availableFortuneProduct(db, { workspaceId, groupId }, buyerUserId);
  if (!target || target.product.revision !== input.revision)
    throw new ApplicationError(
      'CONFLICT',
      '販売条件が変更されました。商品ページを開き直してください。',
    );
  const { product, payment, groupMembershipId } = target;
  const secretKey = new AesGcmPaymentSecretCrypto().decrypt(payment.encryptedSecretKey);
  const liveMode = /^(?:sk|rk)_live_/.test(secretKey);
  const purchase = await db.$transaction(async (tx) => {
    // Serialize checkout creation for a member, including concurrent tabs with different keys.
    await tx.$queryRaw`SELECT id FROM group_memberships
      WHERE id = ${groupMembershipId}::uuid AND workspace_id = ${workspaceId}::uuid
        AND group_id = ${groupId}::uuid AND user_id = ${buyerUserId}::uuid FOR UPDATE`;
    const member = await tx.groupMembership.findFirst({
      where: {
        id: groupMembershipId,
        workspaceId,
        groupId,
        userId: buyerUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
      select: { id: true },
    });
    if (!member) throw new ApplicationError('FORBIDDEN', 'サービスへの参加が必要です。');
    const current = await tx.fortuneCommerceProduct.findFirst({
      where: {
        workspaceId,
        groupId,
        serviceSettingId: product.serviceSettingId,
        enabled: true,
        revision: input.revision,
      },
    });
    if (!current) throw new ApplicationError('CONFLICT', '販売条件が変更されました。');
    const existing = await tx.fortuneCommercePurchase.findFirst({
      where: {
        workspaceId,
        groupId,
        buyerUserId,
        liveMode,
        OR: [
          { id: input.purchaseId },
          { status: 'PENDING' },
          { status: 'PAID', deliveredAt: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      if (
        existing.status !== 'PENDING' ||
        existing.productRevision !== input.revision ||
        existing.paymentConfigurationId !== payment.id
      )
        throw new ApplicationError('CONFLICT', '購入履歴でお支払い・鑑定の状況をご確認ください。');
      return existing;
    }
    return tx.fortuneCommercePurchase.create({
      data: {
        id: input.purchaseId,
        workspaceId,
        groupId,
        buyerUserId,
        groupMembershipId,
        serviceSettingId: product.serviceSettingId,
        paymentConfigurationId: payment.id,
        productRevision: current.revision,
        productName: current.name,
        description: current.description,
        deliveryTerms: current.deliveryTerms,
        refundTerms: current.refundTerms,
        followUpLimit: current.followUpLimit,
        amountYen: current.amountYen,
        liveMode,
      },
    });
  });
  const base = new URL(`/s/${serviceSlug}/fortune-purchase`, getServerEnvironment().APP_URL);
  base.searchParams.set('purchase', purchase.id);
  // Stripe idempotency is time-bounded. Old uncertain purchases are reconciled by the operator.
  if (Date.now() - purchase.createdAt.getTime() >= 23 * 60 * 60 * 1000)
    throw new ApplicationError('CONFLICT', '決済状況を運営者へお問い合わせください。');
  const session = await new StripeCheckoutAdapter().create({
    secretKey,
    purchaseId: purchase.id,
    idempotencyKey: `fortune:${purchase.id}`,
    workspaceId,
    offeringId: purchase.productRevision,
    productName: purchase.productName,
    amountYen: purchase.amountYen,
    successUrl: `${base}&result=return`,
    cancelUrl: `${base}&result=cancel`,
    fortune: {
      terms: `単発1回・カード決済（申込時）\n提供時期 ${purchase.deliveryTerms}\nキャンセル・返金 ${purchase.refundTerms}\n追加質問 ${purchase.followUpLimit}回`,
    },
  });
  const saved = await db.fortuneCommercePurchase.updateMany({
    where: {
      id: purchase.id,
      workspaceId,
      groupId,
      buyerUserId,
      OR: [{ providerCheckoutSessionId: null }, { providerCheckoutSessionId: session.id }],
    },
    data: { providerCheckoutSessionId: session.id },
  });
  if (saved.count !== 1) throw new ApplicationError('CONFLICT', '購入履歴をご確認ください。');
  return session.url;
}

export async function hasAvailableFortunePurchase(
  db: PrismaClient,
  scope: FortuneCommerceScope,
  buyerUserId: string,
) {
  return Boolean(
    await db.fortuneCommercePurchase.findFirst({
      where: {
        ...scope,
        buyerUserId,
        status: 'PAID',
        deliveredAt: null,
        paymentConfiguration: { environment: currentPaymentEnvironment() },
      },
      select: { id: true },
    }),
  );
}
