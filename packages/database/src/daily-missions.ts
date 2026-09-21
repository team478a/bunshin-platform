import {
  GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION,
  selectExternalTrackingLink,
} from '@bunshin/application';
import type {
  DailyMission,
  DailyMissionRepository,
  DailyMissionStatus,
  MissionTrendContext,
} from '@bunshin/capability-social';
import { canManageBunshin } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient, prisma } from './client';
const missionDate = (value: Date) => value.toISOString().slice(0, 10);
type MissionRow = Prisma.DailyMissionGetPayload<{
  include: {
    content: true;
    trendContext: true;
    contentLinkUsage: { include: { productPack: true; campaign: true } };
  };
}>;
function dailyMission(row: MissionRow): DailyMission {
  if (!row.content) throw new ApplicationError('INTERNAL_ERROR', 'mission content missing');
  return {
    ...row,
    missionDate: missionDate(row.missionDate),
    status: row.status,
    format: row.format,
    assistanceLevel: row.assistanceLevel,
    content: row.content.contentJson as Record<string, unknown>,
    trendContext: row.trendContext
      ? {
          id: row.trendContext.id,
          candidateId: row.trendContext.candidateId,
          snapshot: row.trendContext.snapshot as unknown as MissionTrendContext['snapshot'],
          createdAt: row.trendContext.createdAt,
        }
      : null,
    linkUsage: row.contentLinkUsage
      ? {
          linkName: row.contentLinkUsage.linkNameSnapshot,
          insertedUrl: row.contentLinkUsage.insertedUrlSnapshot,
          expiresAt: row.contentLinkUsage.expiresAtSnapshot,
          productName: row.contentLinkUsage.productPack.name,
          campaignName: row.contentLinkUsage.campaign?.name ?? null,
          advertisingClassification: row.contentLinkUsage.advertisingClassification,
        }
      : null,
  };
}
export class PrismaDailyMissionRepository implements DailyMissionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  private include = {
    content: true,
    trendContext: true,
    contentLinkUsage: { include: { productPack: true, campaign: true } },
  } as const;
  private async authorized(
    client: PrismaClient | Prisma.TransactionClient,
    input: {
      workspaceId: string;
      groupId?: string | null;
      actorUserId: string;
      bunshinId: string;
    },
    manage: boolean,
  ) {
    const bunshin = await client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        groupId: input.groupId ?? null,
        ...(input.groupId ? { ownerUserId: input.actorUserId } : {}),
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      include: {
        workspace: {
          select: {
            memberships: {
              where: { userId: input.actorUserId, status: 'ACTIVE' },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!bunshin) return null;
    const role = bunshin.workspace.memberships[0]?.role;
    return !manage || (role && canManageBunshin(role, input.actorUserId, bunshin.ownerUserId))
      ? bunshin
      : null;
  }
  private async row(
    client: PrismaClient | Prisma.TransactionClient,
    input: { workspaceId: string; bunshinId: string; dailyMissionId: string },
  ) {
    return client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
      },
      include: this.include,
    });
  }
  async create(input: Parameters<DailyMissionRepository['create']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        if (!(await this.authorized(tx, input, true))) return null;
        const now = new Date();
        const socialProfile = input.socialProfileId
          ? await tx.socialProfile.findFirst({
              where: {
                id: input.socialProfileId,
                workspaceId: input.workspaceId,
                bunshinId: input.bunshinId,
              },
              select: { id: true, platform: true },
            })
          : null;
        if (input.socialProfileId && !socialProfile) return null;
        if (input.trendCandidateId && !socialProfile) return null;
        const trendCandidate = input.trendCandidateId
          ? await tx.trendIdeaCandidate.findFirst({
              where: {
                id: input.trendCandidateId,
                workspaceId: input.workspaceId,
                bunshinId: input.bunshinId,
                socialProfileId: socialProfile!.id,
                platform: socialProfile!.platform,
                suggestedFormat: input.format,
                safetyStatus: 'SAFE',
                status: { in: ['PROPOSED', 'SELECTED'] },
                expiresAt: { gt: now },
                evidenceLinks: {
                  some: { evidence: { status: 'ACTIVE', expiresAt: { gt: now } } },
                },
              },
              include: {
                evidenceLinks: {
                  where: { evidence: { status: 'ACTIVE', expiresAt: { gt: now } } },
                  include: { evidence: true },
                },
              },
            })
          : null;
        if (input.trendCandidateId && !trendCandidate) return null;
        const weeklyItem = input.weeklyPlanItemId
          ? await tx.weeklyPlanItem.findFirst({
              where: {
                id: input.weeklyPlanItemId,
                workspaceId: input.workspaceId,
                bunshinId: input.bunshinId,
              },
            })
          : null;
        if (input.weeklyPlanItemId && !weeklyItem) return null;
        if (
          weeklyItem &&
          (weeklyItem.campaignId !== (input.campaignId ?? null) ||
            weeklyItem.classification !== (input.classification ?? 'ORGANIC'))
        )
          return null;
        let eligibleCampaign: {
          id: string;
          groupId: string;
          productPackVersion: {
            id: string;
            productPackId: string;
            allowLinklessPosts: boolean;
          };
        } | null = null;
        if (input.campaignId) {
          eligibleCampaign = await tx.campaign.findFirst({
            where: {
              id: input.campaignId,
              status: 'OPEN',
              startsAt: { lte: new Date(`${input.missionDate}T23:59:59.999Z`) },
              endsAt: { gt: new Date(`${input.missionDate}T00:00:00.000Z`) },
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: {
                    userId: input.actorUserId,
                    status: 'ACTIVE',
                    consentedAt: { not: null },
                  },
                },
              },
              participations: {
                some: {
                  participantWorkspaceId: input.workspaceId,
                  userId: input.actorUserId,
                  bunshinId: input.bunshinId,
                  status: 'ACCEPTED',
                },
              },
              productPackVersion: {
                status: 'PUBLISHED',
                assignments: {
                  some: { bunshinId: input.bunshinId, status: 'ACTIVE' },
                },
              },
            },
            select: {
              id: true,
              groupId: true,
              productPackVersion: {
                select: { id: true, productPackId: true, allowLinklessPosts: true },
              },
            },
          });
          if (!eligibleCampaign) return null;
        }
        let resolvedLink: {
          id: string;
          name: string;
          url: string;
          expiresAt: Date | null;
        } | null = null;
        let groupMembershipId: string | null = null;
        let placementTemplate: { id: string; version: number } | null = null;
        if (input.externalLinkUsage) {
          if (
            !eligibleCampaign ||
            input.externalLinkUsage.groupId !== eligibleCampaign.groupId ||
            input.externalLinkUsage.productPackId !==
              eligibleCampaign.productPackVersion.productPackId ||
            input.externalLinkUsage.productPackVersionId !==
              eligibleCampaign.productPackVersion.id ||
            input.externalLinkUsage.campaignId !== eligibleCampaign.id ||
            !socialProfile
          )
            return null;
          const membership = await tx.groupMembership.findFirst({
            where: {
              groupId: eligibleCampaign.groupId,
              workspaceId: input.workspaceId,
              userId: input.actorUserId,
              status: 'ACTIVE',
              consentedAt: { not: null },
            },
            select: { id: true },
          });
          if (!membership) return null;
          groupMembershipId = membership.id;
          const linkAt = new Date(`${input.missionDate}T12:00:00.000Z`);
          const candidates = await tx.externalTrackingLink.findMany({
            where: {
              workspaceId: input.workspaceId,
              groupId: eligibleCampaign.groupId,
              status: 'ACTIVE',
              deletedAt: null,
              system: { status: 'ACTIVE' },
              allowedDomain: { status: 'ACTIVE' },
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: linkAt } }] },
                { OR: [{ expiresAt: null }, { expiresAt: { gt: linkAt } }] },
              ],
              OR: [
                { scopeType: 'GROUP' },
                {
                  scopeType: 'MEMBER',
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
                },
                {
                  scopeType: 'PRODUCT',
                  productPackId: eligibleCampaign.productPackVersion.productPackId,
                },
                {
                  scopeType: 'PRODUCT_MEMBER',
                  productPackId: eligibleCampaign.productPackVersion.productPackId,
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
                },
                { scopeType: 'CAMPAIGN', campaignId: eligibleCampaign.id },
                {
                  scopeType: 'CAMPAIGN_MEMBER',
                  campaignId: eligibleCampaign.id,
                  memberIdentity: { groupMembershipId: membership.id, status: 'ACTIVE' },
                },
              ],
            },
            include: { system: true, allowedDomain: true, memberIdentity: true },
          });
          const selected = selectExternalTrackingLink({
            groupId: eligibleCampaign.groupId,
            groupMembershipId: membership.id,
            productPackId: eligibleCampaign.productPackVersion.productPackId,
            campaignId: eligibleCampaign.id,
            at: linkAt,
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
          if (
            !selected ||
            selected.id !== input.externalLinkUsage.externalTrackingLinkId ||
            selected.url !== input.externalLinkUsage.insertedUrl ||
            JSON.stringify(input.content).split(selected.url).length - 1 !== 1
          )
            return null;
          resolvedLink = selected;
          if (input.externalLinkUsage.placementTemplateId) {
            placementTemplate = await tx.externalLinkPlacementTemplate.findFirst({
              where: {
                id: input.externalLinkUsage.placementTemplateId,
                workspaceId: input.workspaceId,
                groupId: eligibleCampaign.groupId,
                productPackVersionId: eligibleCampaign.productPackVersion.id,
                platform: socialProfile.platform,
                format: input.format,
                status: 'ACTIVE',
                urlLocked: true,
                version: input.externalLinkUsage.placementTemplateVersion ?? -1,
              },
              select: { id: true, version: true },
            });
            if (!placementTemplate) return null;
          } else if (input.externalLinkUsage.placementTemplateVersion !== null) return null;
        } else if (eligibleCampaign && !eligibleCampaign.productPackVersion.allowLinklessPosts) {
          return null;
        }
        const created = await tx.dailyMission.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            socialProfileId: input.socialProfileId ?? null,
            weeklyPlanItemId: input.weeklyPlanItemId ?? null,
            campaignId: input.campaignId ?? null,
            classification: input.classification ?? 'ORGANIC',
            missionDate: new Date(`${input.missionDate}T00:00:00Z`),
            format: input.format,
            assistanceLevel: input.assistanceLevel ?? 'READY_TO_USE',
            estimatedMinutes: input.estimatedMinutes,
            topic: input.topic,
            angle: input.angle,
            reason: input.reason,
            qualityScore: input.qualityScore ?? null,
          },
        });
        await tx.missionContent.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: created.id,
            format: input.format,
            contentJson: input.content as Prisma.InputJsonValue,
          },
        });
        await tx.missionDecision.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            dailyMissionId: created.id,
          },
        });
        if (input.externalLinkUsage && eligibleCampaign && resolvedLink && groupMembershipId) {
          await tx.contentLinkUsage.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: created.id,
              groupId: eligibleCampaign.groupId,
              groupMembershipId,
              userId: input.actorUserId,
              productPackId: eligibleCampaign.productPackVersion.productPackId,
              productPackVersionId: eligibleCampaign.productPackVersion.id,
              campaignId: eligibleCampaign.id,
              externalTrackingLinkId: resolvedLink.id,
              placementTemplateId: placementTemplate?.id ?? null,
              insertedUrlSnapshot: resolvedLink.url,
              linkNameSnapshot: resolvedLink.name,
              expiresAtSnapshot: resolvedLink.expiresAt,
              placementTemplateVersion: placementTemplate?.version ?? null,
              advertisingClassification: input.classification ?? 'ORGANIC',
            },
          });
        }
        if (eligibleCampaign) {
          const approvalPolicy = await tx.campaignPostingApprovalPolicy.findUnique({
            where: { groupId: eligibleCampaign.groupId },
            select: { required: true },
          });
          if (approvalPolicy?.required) {
            const approvalRequest = await tx.campaignPostingApprovalRequest.create({
              data: {
                workspaceId: input.workspaceId,
                groupId: eligibleCampaign.groupId,
                campaignId: eligibleCampaign.id,
                bunshinId: input.bunshinId,
                dailyMissionId: created.id,
                contentSnapshot: input.content as Prisma.InputJsonValue,
                requestedByUserId: input.actorUserId,
              },
            });
            await tx.campaignPostingApprovalAudit.create({
              data: {
                workspaceId: input.workspaceId,
                groupId: eligibleCampaign.groupId,
                requestId: approvalRequest.id,
                action: 'REQUESTED',
                afterData: { status: approvalRequest.status },
                performedByUserId: input.actorUserId,
              },
            });
          }
        }
        if (trendCandidate) {
          const evidence = trendCandidate.evidenceLinks
            .map(({ evidence }) => evidence)
            .sort((left, right) => left.sourceUrl.localeCompare(right.sourceUrl));
          await tx.missionTrendContext.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: created.id,
              candidateId: trendCandidate.id,
              snapshot: {
                candidate: {
                  topic: trendCandidate.topic,
                  hook: trendCandidate.hook,
                  whyNow: trendCandidate.whyNow,
                  fitReason: trendCandidate.fitReason,
                  platform: trendCandidate.platform,
                  format: trendCandidate.suggestedFormat,
                  freshnessScore: trendCandidate.freshnessScore,
                  fitScore: trendCandidate.fitScore,
                  feasibilityScore: trendCandidate.feasibilityScore,
                },
                evidence: evidence.map((item) => ({
                  sourceType: item.sourceType,
                  sourceUrl: item.sourceUrl,
                  sourceTitle: item.sourceTitle,
                  publishedAt: item.publishedAt?.toISOString() ?? null,
                  retrievedAt: item.retrievedAt.toISOString(),
                  summary: item.summary,
                })),
              },
            },
          });
          await tx.trendIdeaCandidate.update({
            where: { id: trendCandidate.id },
            data: { status: 'SELECTED' },
          });
        }
        if (input.generationContext) {
          await tx.generationContextSnapshot.create({
            data: {
              workspaceId: input.workspaceId,
              bunshinId: input.bunshinId,
              dailyMissionId: created.id,
              schemaVersion: GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION,
              payload: input.generationContext.payload as unknown as Prisma.InputJsonValue,
              generatedAt: input.generationContext.generatedAt,
            },
          });
        }
        return dailyMission((await this.row(tx, { ...input, dailyMissionId: created.id }))!);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ApplicationError('CONFLICT', 'daily mission already exists', error);
      throw error;
    }
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
