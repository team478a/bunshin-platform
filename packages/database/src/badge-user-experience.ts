import type { PrismaClient } from '@prisma/client';
import type {
  BadgeUserDashboard,
  BadgeUserExperienceRepository,
  BadgeUserItem,
} from '@bunshin/application';

export class PrismaBadgeUserExperienceRepository implements BadgeUserExperienceRepository {
  constructor(private readonly client: PrismaClient) {}

  async getDashboard(input: Parameters<BadgeUserExperienceRepository['getDashboard']>[0]) {
    const membership = await this.client.workspaceMembership.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        user: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) return null;
    const groups = await this.client.groupMembership.findMany({
      where: {
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        group: { status: 'ACTIVE' },
      },
      select: { group: { select: { id: true, name: true } } },
      orderBy: { group: { name: 'asc' } },
    });
    const groupIds = groups.map(({ group }) => group.id);
    const versions = await this.client.badgeVersion.findMany({
      where: {
        publishedAt: { not: null, lte: input.now },
        OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
          {
            OR: [
              { definition: { ownerType: 'SYSTEM', status: 'ACTIVE' } },
              {
                definition: {
                  ownerType: 'GROUP',
                  status: 'ACTIVE',
                  workspaceId: input.workspaceId,
                  groupId: { in: groupIds },
                },
              },
            ],
          },
        ],
      },
      include: {
        definition: true,
        progress: { where: { workspaceId: input.workspaceId, userId: input.actorUserId }, take: 1 },
        awards: {
          where: { workspaceId: input.workspaceId, userId: input.actorUserId, status: 'ACTIVE' },
          include: { visibility: true },
          take: 1,
        },
      },
      orderBy: [{ definition: { category: 'asc' } }, { definition: { code: 'asc' } }],
    });
    const activeGroups = new Set(groupIds);
    const items: BadgeUserItem[] = versions.map((version) => {
      const progress = version.progress[0];
      const award = version.awards[0];
      const configuredTarget = Number((version.conditionConfig as { target?: number }).target ?? 1);
      const targetValue = progress?.targetValue ?? (configuredTarget > 0 ? configuredTarget : 1);
      const currentValue = award ? targetValue : (progress?.currentValue ?? 0);
      const sharedGroupId = award?.visibility?.sharedGroupId ?? null;
      const sharingActive =
        award?.visibility?.visibility === 'GROUP' &&
        sharedGroupId !== null &&
        activeGroups.has(sharedGroupId);
      return {
        badgeVersionId: version.id,
        awardId: award?.id ?? null,
        code: version.definition.code,
        category: version.definition.category,
        title: version.title,
        description: version.description,
        imageKey: version.imageKey,
        lockedImageKey: version.lockedImageKey,
        altText: version.altText,
        backgroundColor: version.backgroundColor,
        state: award ? 'AWARDED' : progress && progress.currentValue > 0 ? 'IN_PROGRESS' : 'LOCKED',
        currentValue,
        targetValue,
        progressPercent: Math.min(100, Math.round((currentValue / targetValue) * 100)),
        awardedAt: award?.awardedAt ?? null,
        sourceType: award?.sourceType ?? null,
        visibility: sharingActive ? 'GROUP' : 'PRIVATE',
        sharedGroupId: sharingActive ? sharedGroupId : null,
      };
    });
    const dashboard: BadgeUserDashboard = {
      acquired: items
        .filter((item) => item.state === 'AWARDED')
        .sort((a, b) => (b.awardedAt?.getTime() ?? 0) - (a.awardedAt?.getTime() ?? 0)),
      inProgress: items
        .filter((item) => item.state === 'IN_PROGRESS')
        .sort((a, b) => b.progressPercent - a.progressPercent),
      recommended: items
        .filter((item) => item.state !== 'AWARDED')
        .sort((a, b) => b.progressPercent - a.progressPercent)
        .slice(0, 3),
      shareableGroups: groups.map(({ group }) => group),
    };
    return dashboard;
  }

  async setVisibility(input: Parameters<BadgeUserExperienceRepository['setVisibility']>[0]) {
    return this.client.$transaction(async (tx) => {
      const award = await tx.badgeAward.findFirst({
        where: {
          id: input.badgeAwardId,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          status: 'ACTIVE',
          workspace: { memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } } },
        },
        select: { id: true },
      });
      if (!award) return null;
      if (input.visibility === 'GROUP') {
        const membership = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.sharedGroupId!,
            userId: input.actorUserId,
            status: 'ACTIVE',
            group: { status: 'ACTIVE' },
          },
          select: { id: true },
        });
        if (!membership) return null;
      }
      const result = await tx.badgeAwardVisibility.upsert({
        where: { badgeAwardId: award.id },
        create: {
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          badgeAwardId: award.id,
          visibility: input.visibility,
          sharedGroupId: input.sharedGroupId,
        },
        update: { visibility: input.visibility, sharedGroupId: input.sharedGroupId },
      });
      return { visibility: result.visibility, sharedGroupId: result.sharedGroupId };
    });
  }
}
