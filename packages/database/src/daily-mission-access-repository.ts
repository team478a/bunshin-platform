import { selectExternalTrackingLink } from '@bunshin/application';
import type { DailyMissionRepository, DailyMissionStatus } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from './client';
import { PrismaDailyMissionRepositoryBase, dailyMission } from './daily-mission-repository-base';

export class PrismaDailyMissionAccessRepository extends PrismaDailyMissionRepositoryBase {
  constructor(client: PrismaClient) {
    super(client);
  }

  async list(input: Parameters<DailyMissionRepository['list']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    return (
      await this.client.dailyMission.findMany({
        where: {
          workspaceId: input.workspaceId,
          bunshinId: input.bunshinId,
          ...(input.from || input.to
            ? {
                missionDate: {
                  ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}),
                  ...(input.to ? { lte: new Date(`${input.to}T00:00:00Z`) } : {}),
                },
              }
            : {}),
        },
        include: this.include,
        orderBy: [{ missionDate: 'desc' }, { id: 'desc' }],
      })
    ).map(dailyMission);
  }
  async find(input: Parameters<DailyMissionRepository['find']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const value = await this.row(this.client, input);
    return value ? dailyMission(value) : null;
  }
  async authorizeCopy(input: Parameters<DailyMissionRepository['authorizeCopy']>[0]) {
    if (!(await this.authorized(this.client, input, false))) return null;
    const mission = await this.row(this.client, input);
    if (!mission) return null;
    const approval = await this.client.campaignPostingApprovalRequest.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        dailyMissionId: input.dailyMissionId,
      },
      select: { status: true, reviewNote: true },
    });
    if (approval?.status === 'PENDING')
      return { allowed: false, reason: 'APPROVAL_PENDING' as const };
    if (approval?.status === 'CHANGES_REQUESTED')
      return {
        allowed: false,
        reason: 'APPROVAL_CHANGES_REQUESTED' as const,
        reviewNote: approval.reviewNote,
      };
    const usage = mission.contentLinkUsage;
    if (!usage) return { allowed: true, reason: 'READY' } as const;
    if (!mission.content) return { allowed: false, reason: 'LINK_UNAVAILABLE' } as const;
    const membership = await this.client.groupMembership.findFirst({
      where: {
        id: usage.groupMembershipId,
        groupId: usage.groupId,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
      select: { id: true },
    });
    if (!membership) return { allowed: false, reason: 'LINK_UNAVAILABLE' } as const;
    const candidates = await this.client.externalTrackingLink.findMany({
      where: {
        workspaceId: input.workspaceId,
        groupId: usage.groupId,
        status: 'ACTIVE',
        deletedAt: null,
        system: { status: 'ACTIVE' },
        allowedDomain: { status: 'ACTIVE' },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: input.at } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: input.at } }] },
        ],
        OR: [
          { scopeType: 'GROUP' },
          { scopeType: 'MEMBER', memberIdentity: { groupMembershipId: membership.id } },
          { scopeType: 'PRODUCT', productPackId: usage.productPackId },
          {
            scopeType: 'PRODUCT_MEMBER',
            productPackId: usage.productPackId,
            memberIdentity: { groupMembershipId: membership.id },
          },
          ...(usage.campaignId
            ? [
                { scopeType: 'CAMPAIGN' as const, campaignId: usage.campaignId },
                {
                  scopeType: 'CAMPAIGN_MEMBER' as const,
                  campaignId: usage.campaignId,
                  memberIdentity: { groupMembershipId: membership.id },
                },
              ]
            : []),
        ],
      },
      include: { system: true, allowedDomain: true, memberIdentity: true },
    });
    const selected = selectExternalTrackingLink({
      groupId: usage.groupId,
      groupMembershipId: membership.id,
      productPackId: usage.productPackId,
      campaignId: usage.campaignId,
      at: input.at,
      links: candidates.map((link) => ({
        id: link.id,
        name: link.name,
        groupId: link.groupId,
        scopeType: link.scopeType,
        groupMembershipId: link.memberIdentity?.groupMembershipId ?? null,
        productPackId: link.productPackId,
        campaignId: link.campaignId,
        url: link.url,
        status: link.status,
        startsAt: link.startsAt,
        expiresAt: link.expiresAt,
        systemStatus: link.system.status,
        domain: {
          id: link.allowedDomain.id,
          hostname: link.allowedDomain.hostname,
          allowSubdomains: link.allowedDomain.allowSubdomains,
          shortener: link.allowedDomain.shortener,
          status: link.allowedDomain.status,
        },
      })),
    });
    if (!selected) return { allowed: false, reason: 'LINK_UNAVAILABLE' } as const;
    const snapshotCount =
      JSON.stringify(mission.content.contentJson).split(usage.insertedUrlSnapshot).length - 1;
    if (
      selected.id !== usage.externalTrackingLinkId ||
      selected.url !== usage.insertedUrlSnapshot ||
      snapshotCount !== 1
    )
      return { allowed: false, reason: 'LINK_CHANGED' } as const;
    return { allowed: true, reason: 'READY' } as const;
  }
  async transition(input: Parameters<DailyMissionRepository['transition']>[0]) {
    return this.client.$transaction(async (tx) => {
      if (!(await this.authorized(tx, input, true))) return null;
      const row = await this.row(tx, input);
      if (!row) return null;
      if (row.status === input.status) return dailyMission(row);
      const allowed: Record<DailyMissionStatus, DailyMissionStatus[]> = {
        GENERATED: ['VIEWED', 'STARTED', 'COMPLETED', 'SKIPPED', 'EXPIRED'],
        VIEWED: ['STARTED', 'COMPLETED', 'SKIPPED', 'EXPIRED'],
        STARTED: ['COMPLETED', 'SKIPPED', 'EXPIRED'],
        COMPLETED: [],
        SKIPPED: [],
        EXPIRED: [],
      };
      if (!allowed[row.status].includes(input.status))
        throw new ApplicationError('CONFLICT', 'invalid mission transition');
      const now = new Date();
      return dailyMission(
        await tx.dailyMission.update({
          where: { id: row.id },
          data: {
            status: input.status,
            ...(input.status === 'VIEWED' ? { viewedAt: now } : {}),
            ...(input.status === 'STARTED' ? { startedAt: now } : {}),
            ...(input.status === 'COMPLETED' ? { completedAt: now } : {}),
            ...(input.status === 'SKIPPED' ? { skippedAt: now } : {}),
            ...(input.status === 'EXPIRED' ? { expiredAt: now } : {}),
          },
          include: this.include,
        }),
      );
    });
  }
}
