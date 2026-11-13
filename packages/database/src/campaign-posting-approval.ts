import type { Prisma, PrismaClient } from './client';
import { prisma } from './client';

export type CampaignPostingReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED';
export type CampaignPostingReviewResult = 'REVIEWED' | 'MISSING' | 'CAMPAIGN_UNAVAILABLE';

interface ServiceScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
}

/**
 * 企業Serviceの商品投稿確認。呼び出し側でService管理者であることを確認してから使う。
 * 新しい台帳は作らず、既存の確認依頼・監査記録だけを更新する。
 */
export class PrismaCampaignPostingApprovalRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  /**
   * 確認ルールを保存する。確認なしから確認ありへ変えた時は、公開中Campaignの
   * まだ使える投稿案にも同じTransactionで確認依頼を作り、確認前のコピーを止める。
   */
  async updatePolicy(input: ServiceScope & { required: boolean; now: Date }) {
    return this.client.$transaction(async (tx) => {
      const previous = await tx.campaignPostingApprovalPolicy.findUnique({
        where: { groupId: input.groupId },
        select: { required: true },
      });
      await tx.campaignPostingApprovalPolicy.upsert({
        where: { groupId: input.groupId },
        create: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          required: input.required,
          updatedByUserId: input.actorUserId,
        },
        update: { required: input.required, updatedByUserId: input.actorUserId },
      });
      const requested =
        input.required && !previous?.required ? await this.requestExisting(tx, input) : 0;
      await tx.campaignPostingApprovalAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          action: 'POLICY_UPDATED',
          beforeData: previous ? { required: previous.required } : { configured: false },
          afterData: { required: input.required, requestedExisting: requested },
          performedByUserId: input.actorUserId,
        },
      });
      return { required: input.required, requestedExisting: requested };
    });
  }

  private async requestExisting(tx: Prisma.TransactionClient, input: ServiceScope & { now: Date }) {
    const missions = await tx.dailyMission.findMany({
      where: {
        status: { in: ['GENERATED', 'VIEWED', 'STARTED'] },
        campaignPostingApprovalRequest: null,
        content: { isNot: null },
        campaign: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'OPEN',
          endsAt: { gt: input.now },
        },
      },
      select: {
        id: true,
        workspaceId: true,
        bunshinId: true,
        campaignId: true,
        content: { select: { contentJson: true } },
        bunshin: { select: { ownerUserId: true } },
        contentVariantSelections: {
          orderBy: { selectedAt: 'desc' },
          take: 1,
          select: { variant: { select: { contentJson: true } } },
        },
      },
    });
    for (const mission of missions) {
      // 参加者が別案を選んでいれば、その別案がコピーされる本文なので確認対象にする。
      const snapshot =
        mission.contentVariantSelections[0]?.variant.contentJson ?? mission.content!.contentJson;
      const request = await tx.campaignPostingApprovalRequest.create({
        data: {
          workspaceId: mission.workspaceId,
          groupId: input.groupId,
          campaignId: mission.campaignId!,
          bunshinId: mission.bunshinId,
          dailyMissionId: mission.id,
          contentSnapshot: snapshot as Prisma.InputJsonValue,
          requestedByUserId: mission.bunshin.ownerUserId,
        },
      });
      await tx.campaignPostingApprovalAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          requestId: request.id,
          action: 'REQUESTED',
          afterData: { status: request.status, reason: 'POLICY_ENABLED' },
          performedByUserId: input.actorUserId,
        },
      });
    }
    return missions.length;
  }

  /** 確認待ちの投稿案を確認する。終了・中止したCampaignの投稿案は確認しない。 */
  async review(
    input: ServiceScope & {
      requestId: string;
      decision: CampaignPostingReviewDecision;
      reviewNote: string | null;
      now: Date;
    },
  ): Promise<CampaignPostingReviewResult> {
    return this.client.$transaction(async (tx) => {
      const previous = await tx.campaignPostingApprovalRequest.findFirst({
        where: {
          id: input.requestId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          status: 'PENDING',
        },
        select: {
          id: true,
          status: true,
          campaign: { select: { status: true, startsAt: true, endsAt: true } },
        },
      });
      if (!previous) return 'MISSING';
      if (!campaignOpen(previous.campaign, input.now)) return 'CAMPAIGN_UNAVAILABLE';
      const changed = await tx.campaignPostingApprovalRequest.updateMany({
        where: { id: previous.id, status: 'PENDING' },
        data: {
          status: input.decision,
          reviewNote: input.reviewNote,
          reviewedByUserId: input.actorUserId,
          reviewedAt: input.now,
        },
      });
      if (changed.count !== 1) return 'MISSING';
      await tx.campaignPostingApprovalAudit.create({
        data: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          requestId: previous.id,
          action: input.decision,
          beforeData: { status: previous.status },
          afterData: { status: input.decision },
          note: input.reviewNote,
          performedByUserId: input.actorUserId,
        },
      });
      return 'REVIEWED';
    });
  }
}

export function campaignOpen(
  campaign: { status: string; startsAt: Date; endsAt: Date },
  now: Date,
): boolean {
  return campaign.status === 'OPEN' && campaign.startsAt <= now && campaign.endsAt > now;
}
