import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { csv } from './admin-report-export';

type PaymentExportRow = {
  id: string;
  groupId: string;
  status: string;
  amountYen: number;
  refundedAmountYen: number;
  disputedAmountYen: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
  disputedAt: Date | null;
  disputeResolvedAt: Date | null;
  providerDisputeId: string | null;
  disputeStatus: string | null;
  expiredAt: Date | null;
  providerCheckoutSessionId: string | null;
  providerPaymentIntentId: string | null;
  buyer: { displayName: string; email: string | null };
};

export function organizationPaymentCsvRows(
  purchases: PaymentExportRow[],
  groupNames: Map<string, string>,
) {
  return [
    [
      '購入ID',
      '受付日時',
      '購入者名',
      '購入者メール',
      'サービス',
      '決済額（円）',
      '返金額（円）',
      '係争・チャージバック額（円）',
      '差引額（円）',
      '通貨',
      '状態',
      '入金日時',
      '返金完了日時',
      '異議申立て開始日時',
      '異議申立て解決日時',
      '異議申立て状態',
      '期限切れ日時',
      'Stripe Checkout ID',
      'Stripe Payment Intent ID',
      'Stripe Dispute ID',
    ],
    ...purchases.map((purchase) => [
      purchase.id,
      purchase.createdAt.toISOString(),
      purchase.buyer.displayName,
      purchase.buyer.email,
      groupNames.get(purchase.groupId) ?? '削除済みのサービス',
      purchase.amountYen,
      purchase.refundedAmountYen,
      purchase.disputedAmountYen,
      Math.max(
        0,
        purchase.amountYen - Math.max(purchase.refundedAmountYen, purchase.disputedAmountYen),
      ),
      purchase.currency,
      purchase.status,
      purchase.paidAt?.toISOString() ?? null,
      purchase.refundedAt?.toISOString() ?? null,
      purchase.disputedAt?.toISOString() ?? null,
      purchase.disputeResolvedAt?.toISOString() ?? null,
      purchase.disputeStatus,
      purchase.expiredAt?.toISOString() ?? null,
      purchase.providerCheckoutSessionId,
      purchase.providerPaymentIntentId,
      purchase.providerDisputeId,
    ]),
  ];
}

export async function organizationPaymentExportResponse(request: Request, rawWorkspaceId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const workspaceId = z.string().uuid().parse(rawWorkspaceId);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const db = await import('@bunshin/database');
    const [workspace, platformAdmin, membership] = await Promise.all([
      db.prisma.workspace.findFirst({
        where: { id: workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' },
        select: { id: true },
      }),
      new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(actor.userId),
      db.prisma.workspaceMembership.findFirst({
        where: {
          workspaceId,
          userId: actor.userId,
          role: { in: ['OWNER', 'ADMIN'] },
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);
    if (!workspace || (!platformAdmin && !membership)) {
      throw new ApplicationError('NOT_FOUND', 'organization unavailable');
    }
    const purchases = await db.prisma.programPurchase.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      select: {
        id: true,
        groupId: true,
        status: true,
        amountYen: true,
        refundedAmountYen: true,
        disputedAmountYen: true,
        currency: true,
        createdAt: true,
        paidAt: true,
        refundedAt: true,
        disputedAt: true,
        disputeResolvedAt: true,
        disputeStatus: true,
        expiredAt: true,
        providerCheckoutSessionId: true,
        providerPaymentIntentId: true,
        providerDisputeId: true,
        buyer: { select: { displayName: true, email: true } },
      },
    });
    const groupIds = [...new Set(purchases.map((purchase) => purchase.groupId))];
    const groups =
      groupIds.length === 0
        ? []
        : await db.prisma.group.findMany({
            where: { workspaceId, id: { in: groupIds } },
            select: { id: true, name: true },
          });
    return new Response(
      csv(
        organizationPaymentCsvRows(
          purchases,
          new Map(groups.map((group) => [group.id, group.name])),
        ),
      ),
      {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="organization-payments-${workspaceId}.csv"`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
