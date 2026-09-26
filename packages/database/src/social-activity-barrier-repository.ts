import {
  socialActivityBarrierEvidenceKey,
  type SocialActivityBarrierCase,
  type SocialActivityBarrierCaseRepository,
  type SocialActivityBarrierObservationRepository,
  type SocialActivityBarrierScope,
} from '@bunshin/capability-social';
import type { Prisma, PrismaClient } from '@prisma/client';

const COPY_TYPES = [
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
] as const;

function sameScope(left: SocialActivityBarrierScope, right: SocialActivityBarrierScope) {
  return (
    left.workspaceId === right.workspaceId &&
    left.serviceId === right.serviceId &&
    left.groupMembershipId === right.groupMembershipId &&
    left.userId === right.userId &&
    left.bunshinId === right.bunshinId
  );
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function numericMetric(value: Prisma.JsonValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function record(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function hasPositiveResponse(value: Prisma.JsonValue | null) {
  const metrics = record(value);
  return ['comments', 'replies', 'directMessages', 'inquiries'].some(
    (key) => numericMetric(metrics[key]) > 0,
  );
}

function hasConversionAction(value: Prisma.JsonValue | null) {
  const metrics = record(value);
  return ['linkClicks', 'leads', 'conversions', 'reservations', 'purchases'].some(
    (key) => numericMetric(metrics[key]) > 0,
  );
}

export class PrismaSocialActivityBarrierObservationRepository implements SocialActivityBarrierObservationRepository {
  constructor(private readonly client: PrismaClient) {}

  async collect(input: Parameters<SocialActivityBarrierObservationRepository['collect']>[0]) {
    if (input.from.getTime() >= input.to.getTime()) return null;

    const groupId = input.scope.serviceId;
    const [membership, bunshin] = await Promise.all([
      this.client.groupMembership.findFirst({
        where: {
          workspaceId: input.scope.workspaceId,
          groupId,
          id: input.scope.groupMembershipId,
          userId: input.scope.userId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      this.client.bunshin.findFirst({
        where: {
          workspaceId: input.scope.workspaceId,
          groupId,
          id: input.scope.bunshinId,
          ownerUserId: input.scope.userId,
        },
        select: { id: true },
      }),
    ]);
    if (!membership || !bunshin) return null;

    const [missions, failedGenerations, insightSnapshots, businessProfile] = await Promise.all([
      this.client.dailyMission.findMany({
        where: {
          workspaceId: input.scope.workspaceId,
          bunshinId: input.scope.bunshinId,
          missionDate: { gte: input.from, lt: input.to },
        },
        select: {
          id: true,
          missionDate: true,
          decision: { select: { decision: true } },
          activities: {
            where: {
              actorUserId: input.scope.userId,
              occurredAt: { gte: input.from, lt: input.to },
            },
            select: { type: true },
          },
          postRecord: { select: { manualMetrics: true } },
          lineMessageDeliveries: {
            where: {
              userId: input.scope.userId,
              groupId,
              createdAt: { gte: input.from, lt: input.to },
            },
            select: { status: true },
          },
        },
      }),
      this.client.dailyMissionGeneration.findMany({
        where: {
          workspaceId: input.scope.workspaceId,
          bunshinId: input.scope.bunshinId,
          actorUserId: input.scope.userId,
          missionDate: { gte: input.from, lt: input.to },
          status: 'FAILED',
        },
        select: { missionDate: true },
      }),
      this.client.socialInsightSnapshot.findMany({
        where: {
          workspaceId: input.scope.workspaceId,
          groupId,
          groupMembershipId: input.scope.groupMembershipId,
          userId: input.scope.userId,
          bunshinId: input.scope.bunshinId,
          observedOn: { gte: input.from, lt: input.to },
        },
        select: { interactions: true },
      }),
      this.client.serviceMemberBusinessProfile.findFirst({
        where: {
          workspaceId: input.scope.workspaceId,
          groupId,
          groupMembershipId: input.scope.groupMembershipId,
          userId: input.scope.userId,
        },
        select: { id: true },
      }),
    ]);

    const incidentDays = new Set(failedGenerations.map((value) => dayKey(value.missionDate)));
    for (const mission of missions) {
      if (mission.lineMessageDeliveries.some((delivery) => delivery.status === 'FAILED')) {
        incidentDays.add(dayKey(mission.missionDate));
      }
    }

    const eligibleMissions = missions.filter(
      (mission) => !incidentDays.has(dayKey(mission.missionDate)),
    );
    const activityTypes = (mission: (typeof eligibleMissions)[number]) =>
      new Set(mission.activities.map((activity) => activity.type));

    const positivePostResponses = eligibleMissions.filter((mission) =>
      hasPositiveResponse(mission.postRecord?.manualMetrics ?? null),
    ).length;
    const conversions = eligibleMissions.filter((mission) =>
      hasConversionAction(mission.postRecord?.manualMetrics ?? null),
    ).length;

    return {
      scope: input.scope,
      observationWindow: {
        from: input.from,
        to: input.to,
        eligibleDays: new Set(eligibleMissions.map((mission) => dayKey(mission.missionDate))).size,
        excludedSystemIncidentDays: incidentDays.size,
      },
      metrics: {
        onboardingCompleted: businessProfile !== null,
        lineDelivered: eligibleMissions.filter((mission) =>
          mission.lineMessageDeliveries.some((delivery) => delivery.status === 'SENT'),
        ).length,
        missionViewed: eligibleMissions.filter((mission) => activityTypes(mission).has('VIEWED'))
          .length,
        missionAccepted: eligibleMissions.filter(
          (mission) =>
            mission.decision?.decision === 'ACCEPTED' || activityTypes(mission).has('ACCEPTED'),
        ).length,
        contentCopied: eligibleMissions.filter((mission) =>
          COPY_TYPES.some((type) => activityTypes(mission).has(type)),
        ).length,
        postCompleted: eligibleMissions.filter(
          (mission) => mission.postRecord !== null || activityTypes(mission).has('POSTED'),
        ).length,
        insightRecorded: insightSnapshots.length,
        positiveResponseRecorded:
          positivePostResponses +
          insightSnapshots.filter((snapshot) => (snapshot.interactions ?? 0) > 0).length,
        conversionActionRecorded: conversions,
      },
    };
  }
}

export class PrismaSocialActivityBarrierCaseRepository implements SocialActivityBarrierCaseRepository {
  constructor(private readonly client: PrismaClient) {}

  async saveSuspicions(
    input: Parameters<SocialActivityBarrierCaseRepository['saveSuspicions']>[0],
  ) {
    if (input.candidates.some((candidate) => !sameScope(candidate.scope, input.scope))) return null;
    if (input.candidates.some((candidate) => candidate.status !== 'SUSPECTED')) return null;

    return this.client.$transaction(async (tx) => {
      const [membership, bunshin] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            workspaceId: input.scope.workspaceId,
            groupId: input.scope.serviceId,
            id: input.scope.groupMembershipId,
            userId: input.scope.userId,
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
        tx.bunshin.findFirst({
          where: {
            workspaceId: input.scope.workspaceId,
            groupId: input.scope.serviceId,
            id: input.scope.bunshinId,
            ownerUserId: input.scope.userId,
          },
          select: { id: true },
        }),
      ]);
      if (!membership || !bunshin) return null;

      const saved: SocialActivityBarrierCase[] = [];
      for (const candidate of input.candidates) {
        const unique = {
          workspaceId: input.scope.workspaceId,
          groupId: input.scope.serviceId,
          groupMembershipId: input.scope.groupMembershipId,
          userId: input.scope.userId,
          bunshinId: input.scope.bunshinId,
          category: candidate.category,
        } as const;
        let barrierCase = await tx.socialActivityBarrierCase.findUnique({
          where: { workspaceId_groupId_groupMembershipId_userId_bunshinId_category: unique },
        });

        if (
          barrierCase &&
          (barrierCase.status === 'RESOLVED' || barrierCase.status === 'DISMISSED') &&
          barrierCase.nextEligibleAt &&
          barrierCase.nextEligibleAt > input.detectedAt
        ) {
          continue;
        }

        if (!barrierCase) {
          barrierCase = await tx.socialActivityBarrierCase.create({
            data: {
              ...unique,
              status: 'SUSPECTED',
              ruleVersion: candidate.evidence.ruleVersion,
              firstDetectedAt: input.detectedAt,
              lastDetectedAt: input.detectedAt,
            },
          });
        }

        const evidenceKey = socialActivityBarrierEvidenceKey(candidate);
        const existingEvidence = await tx.socialActivityBarrierEvidence.findUnique({
          where: {
            caseId_evidenceKey: {
              caseId: barrierCase.id,
              evidenceKey,
            },
          },
          select: { id: true },
        });

        if (!existingEvidence) {
          const reopened = barrierCase.status === 'RESOLVED' || barrierCase.status === 'DISMISSED';
          barrierCase = await tx.socialActivityBarrierCase.update({
            where: { id: barrierCase.id },
            data: {
              ruleVersion: candidate.evidence.ruleVersion,
              lastDetectedAt: input.detectedAt,
              ...(reopened
                ? {
                    status: 'SUSPECTED' as const,
                    recurrenceCount: { increment: 1 },
                    nextEligibleAt: null,
                    confirmedAt: null,
                    resolvedAt: null,
                    dismissedAt: null,
                  }
                : {}),
              evidenceSnapshots: {
                create: {
                  evidenceKey,
                  evidenceCode: candidate.evidence.evidenceCode,
                  observationFrom: new Date(candidate.evidence.observationWindow.from),
                  observationTo: new Date(candidate.evidence.observationWindow.to),
                  eligibleDays: candidate.evidence.observationWindow.eligibleDays,
                  excludedSystemIncidentDays:
                    candidate.evidence.observationWindow.excludedSystemIncidentDays,
                  metrics: candidate.evidence.metrics,
                  thresholds: candidate.evidence.thresholds,
                  ruleVersion: candidate.evidence.ruleVersion,
                  detectedAt: input.detectedAt,
                },
              },
            },
          });
        }

        saved.push({
          id: barrierCase.id,
          scope: input.scope,
          category: barrierCase.category,
          status: barrierCase.status,
          ruleVersion: barrierCase.ruleVersion,
          recurrenceCount: barrierCase.recurrenceCount,
          firstDetectedAt: barrierCase.firstDetectedAt,
          lastDetectedAt: barrierCase.lastDetectedAt,
          nextEligibleAt: barrierCase.nextEligibleAt,
          evidence: candidate.evidence,
        });
      }
      return saved;
    });
  }
}
