import {
  GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION,
  selectExternalTrackingLink,
} from '@bunshin/application';
import type { DailyMissionRepository } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient } from './client';
import { PrismaDailyMissionRepositoryBase, dailyMission } from './daily-mission-repository-base';

export class PrismaDailyMissionCreationRepository extends PrismaDailyMissionRepositoryBase {
  constructor(client: PrismaClient) {
    super(client);
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
}
