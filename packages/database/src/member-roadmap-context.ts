import {
  createDefaultMemberRoadmapDefinition,
  type MemberRoadmapContext,
  type MemberRoadmapContextRepository,
  type MemberUsageRequest,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { PrismaClient } from '@prisma/client';
import { PrismaGroupFeatureEntitlementRepository } from './group-feature-entitlement';
import {
  memberUsageReadOptions,
  snapshotMemberUsageRequest,
  isMemberUsagePermitted,
} from './member-usage-authorization';

/** Owner-only evidence projection. Never generates content, grants access or consumes quota. */
export class PrismaMemberRoadmapContextRepository implements MemberRoadmapContextRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly now = () => new Date(),
  ) {}

  read(input: MemberUsageRequest): Promise<MemberRoadmapContext | null> {
    const request = snapshotMemberUsageRequest(input);
    try {
      if (!request.timezone || request.timezone.length > 64) throw new Error('invalid timezone');
      new Intl.DateTimeFormat('sv-SE', { timeZone: request.timezone }).format(request.asOf);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid roadmap timezone');
    }
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const now = this.now();
      if (!(await isMemberUsagePermitted(tx, request, now))) return null;
      const s = request.scope;
      const bunshinOwner = {
        workspaceId: s.workspaceId,
        groupId: s.serviceId,
        ownerUserId: s.userId,
        status: { not: 'ARCHIVED' as const },
      };
      const member = {
        workspaceId: s.workspaceId,
        groupId: s.serviceId,
        groupMembershipId: s.groupMembershipId,
        userId: s.userId,
      };
      const owned = { workspaceId: s.workspaceId, bunshinId: s.bunshinId, bunshin: bunshinOwner };
      const before = { lte: request.asOf };
      const [onboarding, profile, plan, prepared, metrics, current, pendingDecision] =
        await Promise.all([
          tx.serviceOnboardingResponse.findFirst({
            where: { ...member, completedAt: before, createdAt: before },
            select: { id: true },
          }),
          tx.socialProfile.findFirst({
            where: { ...owned, createdAt: before },
            select: { id: true },
          }),
          tx.weeklyPlan.findFirst({
            where: {
              ...owned,
              status: { in: ['CONFIRMED', 'EXPIRED'] },
              confirmedAt: before,
              createdAt: before,
            },
            select: { id: true },
          }),
          tx.missionActivity.findFirst({
            where: {
              workspaceId: s.workspaceId,
              bunshinId: s.bunshinId,
              actorUserId: s.userId,
              occurredAt: before,
              type: {
                in: [
                  'COPIED_TEXT',
                  'COPIED_SLIDE',
                  'COPIED_IMAGE_INSTRUCTION',
                  'COPIED_VIDEO_PROMPT',
                  'COPIED_SCRIPT',
                ],
              },
              dailyMission: owned,
            },
            select: { id: true },
          }),
          tx.socialInsightSnapshot.findFirst({
            where: {
              ...member,
              ...owned,
              source: { in: ['MANUAL', 'SCREENSHOT'] },
              createdAt: before,
              socialProfile: owned,
            },
            select: { id: true },
          }),
          tx.bunshin.findFirst({
            where: { ...bunshinOwner, id: s.bunshinId },
            select: {
              status: true,
              capabilityAssignments: {
                where: {
                  workspaceId: s.workspaceId,
                  capabilityType: 'SOCIAL',
                  status: 'ACTIVE',
                  activatedAt: { lte: now },
                },
                select: { id: true },
                take: 1,
              },
              socialProfiles: {
                where: { workspaceId: s.workspaceId, status: 'ACTIVE', createdAt: { lte: now } },
                select: { id: true },
                take: 1,
              },
            },
          }),
          tx.dailyMission.findFirst({
            where: {
              ...owned,
              createdAt: { lte: now },
              status: { in: ['GENERATED', 'VIEWED', 'STARTED'] },
              content: { isNot: null },
              decision: {
                is: { decision: 'PENDING', workspaceId: s.workspaceId, bunshinId: s.bunshinId },
              },
            },
            select: { id: true },
          }),
        ]);
      if (!current) return null;
      const access = await new PrismaGroupFeatureEntitlementRepository(
        this.client,
      ).resolveAccessInTransaction(tx, {
        workspaceId: s.workspaceId,
        groupId: s.serviceId,
        actorUserId: s.userId,
        featureKey: 'SOCIAL',
        now,
      });
      if (!access) return null;
      const enabled = current.status === 'ACTIVE' && current.capabilityAssignments.length > 0;
      return {
        scope: { ...s },
        asOf: request.asOf.toISOString(),
        timezone: request.timezone,
        definition: createDefaultMemberRoadmapDefinition(),
        facts: {
          INITIAL_SETUP: onboarding && profile ? true : null,
          WEEKLY_PLAN: plan ? true : null,
          POST_PREPARATION: prepared ? true : null,
          SNS_METRICS: metrics ? true : null,
        },
        features: {
          FIRST_DECISION: {
            implemented: true,
            enabled,
            access: { ...access },
            budgetAllowed: true,
            readyForRecommendation: Boolean(pendingDecision),
          },
          POST_HISTORY: {
            implemented: true,
            enabled,
            access: { ...access },
            budgetAllowed: true,
            readyForRecommendation: true,
          },
          SNS_METRICS: {
            implemented: true,
            enabled,
            access: { ...access },
            budgetAllowed: true,
            readyForRecommendation: current.socialProfiles.length > 0,
          },
        },
        validReferrals: null,
      };
    }, memberUsageReadOptions);
  }
}
