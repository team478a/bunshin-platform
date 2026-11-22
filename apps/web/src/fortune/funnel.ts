import 'server-only';
import { cookies } from 'next/headers';
import { createLogger } from '@bunshin/observability';
import { toJapanLocalDate } from '@bunshin/capability-fortune';
import type { Prisma, PrismaClient } from '@bunshin/database';
import { z } from 'zod';

export const funnelTopics = [
  'FREE_START',
  'FREE_COMPLETE',
  'PAID_OFFER',
  'PRODUCT_DETAIL',
  'PURCHASE_CLICK',
] as const;
type Topic = (typeof funnelTopics)[number];
type Scope = { workspaceId: string; groupId: string };
const logger = createLogger();
const acquisitionTag = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);
export const optionalAcquisitionTag = (value: unknown) =>
  acquisitionTag.safeParse(value).data ?? null;
export const acquisitionCookieName = (slug: string) => `fortune_acquisition_${slug}`;
export const acquisitionCookieAge = 30 * 24 * 60 * 60;

export async function fortuneFunnelSetting(db: PrismaClient, scope: Scope, slug: string) {
  return db.fortuneServiceSetting.findFirst({
    where: {
      ...scope,
      enabled: true,
      configuration: { slug },
      ...(slug === 'watashi-fortune' ? {} : { commerceProduct: { isNot: null } }),
    },
    select: { id: true, bunshinId: true },
  });
}

export async function recordFortuneFunnel(slug: string, userId: string, topic: Topic) {
  try {
    const { prisma } = await import('@bunshin/database');
    const membership = await prisma.groupMembership.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        serviceRole: 'PARTICIPANT',
        consentedAt: { not: null },
        group: {
          fortuneServiceSetting: {
            enabled: true,
            configuration: { slug },
            ...(slug === 'watashi-fortune' ? {} : { commerceProduct: { isNot: null } }),
          },
        },
      },
      select: { id: true, workspaceId: true, groupId: true },
    });
    if (!membership) return;
    await prisma.serviceMembershipEvent.createMany({
      data: {
        workspaceId: membership.workspaceId,
        groupId: membership.groupId,
        groupMembershipId: membership.id,
        userId,
        eventType: 'FORTUNE_FUNNEL',
        topic,
        idempotencyKey: `fortune-funnel:${membership.id}:${topic}:${toJapanLocalDate(new Date())}`,
      },
      skipDuplicates: true,
    });
  } catch {
    logger.warn('fortune funnel event could not be recorded');
  }
}

export async function purchaseAcquisition(
  tx: Prisma.TransactionClient,
  scope: Scope & { buyerUserId: string; groupMembershipId: string },
  visitId: string | null,
) {
  const { buyerUserId, groupMembershipId, ...service } = scope;
  const earlier = await tx.fortuneCommercePurchase.findFirst({
    where: { ...service, buyerUserId, paidAt: { not: null }, acquisitionChannel: { not: null } },
    orderBy: { paidAt: 'asc' },
    select: { acquisitionChannel: true, acquisitionMedium: true, acquisitionCampaign: true },
  });
  if (earlier) return earlier;
  const referral = await tx.serviceReferral.findFirst({
    where: {
      ...service,
      referredMembershipId: groupMembershipId,
      referredUserId: buyerUserId,
      status: { not: 'REJECTED' },
    },
    select: { id: true },
  });
  if (referral) return { acquisitionChannel: 'referral' };
  if (!visitId) return {};
  const visit = await tx.fortuneAcquisitionVisit.findFirst({
    where: {
      ...service,
      id: visitId,
      occurredAt: { gte: new Date(Date.now() - acquisitionCookieAge * 1000) },
    },
  });
  return visit
    ? {
        acquisitionChannel: visit.channel,
        acquisitionMedium: visit.medium,
        acquisitionCampaign: visit.campaign,
      }
    : {};
}

export async function fortuneAcquisitionCookie(slug: string) {
  const value = (await cookies()).get(acquisitionCookieName(slug))?.value;
  return z.string().uuid().safeParse(value).data ?? null;
}
