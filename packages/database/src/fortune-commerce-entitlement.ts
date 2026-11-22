import { ApplicationError } from '@bunshin/shared';
import type { Prisma } from '@prisma/client';

type Scope = { id: string; workspaceId: string; groupId: string };

export function usesFortuneCommerce(serviceSlug: string, scope: { commerceProduct?: unknown }) {
  return serviceSlug === 'watashi-fortune' || Boolean(scope.commerceProduct);
}

export const fortunePurchaseScope = (scope: Scope, buyerUserId: string) => ({
  workspaceId: scope.workspaceId,
  groupId: scope.groupId,
  serviceSettingId: scope.id,
  buyerUserId,
});

export async function reserveFortunePurchase(
  tx: Prisma.TransactionClient,
  input: ReturnType<typeof fortunePurchaseScope> & { readingId: string; membershipId: string },
) {
  const { readingId, membershipId, ...scope } = input;
  const purchases = await tx.fortuneCommercePurchase.findMany({
    where: { ...scope, groupMembershipId: membershipId, status: 'PAID', deliveredAt: null },
    orderBy: { paidAt: 'asc' },
  });
  for (const purchase of purchases) {
    if (purchase.readingId === readingId) return;
    if (purchase.readingId) {
      const previous = await tx.fortuneReading.findFirst({
        where: {
          id: purchase.readingId,
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.serviceSettingId,
          memberUserId: scope.buyerUserId,
        },
        select: { status: true, pendingUnderstanding: true },
      });
      if (previous?.status === 'GENERATING' || previous?.pendingUnderstanding) continue;
    }
    const changed = await tx.fortuneCommercePurchase.updateMany({
      where: {
        ...scope,
        id: purchase.id,
        readingId: purchase.readingId,
        status: 'PAID',
        deliveredAt: null,
      },
      data: { readingId },
    });
    if (changed.count === 1) return;
  }
  throw new ApplicationError(
    'FORBIDDEN',
    '深層鑑定を利用できる購入がありません。購入履歴をご確認ください。',
  );
}
