import type { SocialImageGenerationAuthorizationPort } from '@bunshin/application';
import { type PrismaClient, prisma } from './client';
import { PrismaGroupFeatureEntitlementRepository } from './group-feature-entitlement';
import { socialImagePilotCanGenerate } from './social-image-pilot-policy';
export class PrismaSocialImageGenerationAuthorizationRepository implements SocialImageGenerationAuthorizationPort {
  constructor(private readonly client: PrismaClient = prisma) {}

  async authorize(input: Parameters<SocialImageGenerationAuthorizationPort['authorize']>[0]) {
    if (input.environment !== 'PRODUCTION')
      return { allowed: false as const, reason: 'NOT_PRODUCTION' as const };
    const membership = await this.client.groupMembership.findFirst({
      where: {
        id: input.groupMembershipId,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) return { allowed: false as const, reason: 'MEMBERSHIP_UNAVAILABLE' as const };
    const access = await new PrismaGroupFeatureEntitlementRepository(this.client).resolveAccess({
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      featureKey: 'SOCIAL.IMAGE_GENERATION',
      now: input.now,
    });
    if (!access?.allowed)
      return { allowed: false as const, reason: 'FEATURE_UNAVAILABLE' as const };
    const bunshin = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        status: { not: 'ARCHIVED' },
        capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!bunshin) return { allowed: false as const, reason: 'BUNSHIN_UNAVAILABLE' as const };
    const mission = await this.client.dailyMission.findFirst({
      where: {
        id: input.dailyMissionId,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        format: { in: ['IMAGE', 'SLIDE'] },
      },
      select: { id: true },
    });
    if (!mission) return { allowed: false as const, reason: 'MISSION_FORMAT_UNAVAILABLE' as const };
    if (input.campaignId) {
      const campaign = await this.client.campaign.findFirst({
        where: {
          id: input.campaignId,
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          ...(input.productPackVersionId
            ? { productPackVersionId: input.productPackVersionId }
            : {}),
          status: 'OPEN',
          startsAt: { lte: input.now },
          endsAt: { gt: input.now },
          participations: {
            some: {
              participantWorkspaceId: input.workspaceId,
              userId: input.actorUserId,
              bunshinId: input.bunshinId,
              status: 'ACCEPTED',
              consentedAt: { not: null },
            },
          },
        },
        select: { id: true },
      });
      if (!campaign) return { allowed: false as const, reason: 'CAMPAIGN_UNAVAILABLE' as const };
    }
    const enrollment = await this.client.socialImagePilotEnrollment.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        status: 'ACTIVE',
        revokedAt: null,
        pilot: {
          status: 'ACTIVE',
          emergencyStop: false,
          OR: [{ startsAt: null }, { startsAt: { lte: input.now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] }],
        },
      },
      include: { pilot: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!enrollment) return { allowed: false as const, reason: 'PILOT_UNAVAILABLE' as const };
    if (
      !(await socialImagePilotCanGenerate(this.client, {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        pilotId: enrollment.pilotId,
        pilotEnrollmentId: enrollment.id,
      }))
    )
      return { allowed: false as const, reason: 'PILOT_UNAVAILABLE' as const };
    const dailyFrom = new Date(
      Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()),
    );
    const monthlyFrom = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1));
    const success = {
      status: 'READY_FOR_REVIEW' as const,
      pilotEnrollment: { pilotId: enrollment.pilotId },
    };
    const [dailyUsed, monthlyUsed, memberUsed] = await Promise.all([
      this.client.socialImageGenerationRequest.count({
        where: { ...success, updatedAt: { gte: dailyFrom, lt: input.now } },
      }),
      this.client.socialImageGenerationRequest.count({
        where: { ...success, updatedAt: { gte: monthlyFrom, lt: input.now } },
      }),
      this.client.socialImageGenerationRequest.count({
        where: {
          ...success,
          groupMembershipId: input.groupMembershipId,
          updatedAt: { gte: monthlyFrom, lt: input.now },
        },
      }),
    ]);
    if (
      dailyUsed >= enrollment.pilot.dailyLimit ||
      monthlyUsed >= enrollment.pilot.monthlyLimit ||
      memberUsed >= enrollment.pilot.memberMonthlyLimit
    )
      return { allowed: false as const, reason: 'LIMIT_REACHED' as const };
    return {
      allowed: true as const,
      pilotEnrollmentId: enrollment.id,
      generationContextSnapshotId: null,
    };
  }
}
