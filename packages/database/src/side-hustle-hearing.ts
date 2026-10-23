import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  validateSavePersonalLearningRequest,
  type PersonalLearningActor,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import {
  personalLearningOfferPolicy,
  personalLearningFeatureEnabled,
  SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION,
  SIDE_HUSTLE_HEARING_VERSION,
  SIDE_HUSTLE_SCREENING_RULE_VERSION,
  validateSideHustleHearing,
  validateSideHustleRoadmapProposal,
  buildSideHustleInitialRequest,
  SIDE_HUSTLE_PERIODS,
  SIDE_HUSTLE_CHECKIN_VERSION,
  validateSideHustleCheckin,
  sideHustleCheckinEligibility,
  buildSideHustleStageRequest,
  parseStoredSideHustleCandidateProposal,
  screenSideHustleCandidates,
  type SideHustleHearing,
  type SideHustleScreeningResult,
  type ValidatedSideHustleCandidateProposal,
  type SideHustleRoadmapProposal,
  type SideHustleCandidate,
} from '@bunshin/capability-training';
import { PrismaPersonalLearningRequestRepository } from './personal-learning-request';

const HEARING = 'SIDE_HUSTLE_HEARING_SAVED';
const PROPOSAL = 'SIDE_HUSTLE_PROPOSAL_SAVED';
const SELECTED = 'SIDE_HUSTLE_SELECTED';
const ROADMAP = 'SIDE_HUSTLE_ROADMAP_PROPOSED';
const STARTED = 'SIDE_HUSTLE_STARTED';
const CHECKIN = 'SIDE_HUSTLE_CHECKIN_SAVED';
const STAGE_ADVANCED = 'SIDE_HUSTLE_STAGE_ADVANCED';
const stableJson = (value: unknown): string => {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
};
const digest = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex');
const legacyDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const metadata = (value: Prisma.JsonValue): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const scopeOf = (actor: PersonalLearningActor) => ({
  workspaceId: actor.scope.workspaceId,
  groupId: actor.scope.groupId,
  programEnrollmentId: actor.scope.programEnrollmentId,
});
const conflict = (): never => {
  throw new ApplicationError('CONFLICT', 'side hustle hearing changed');
};

export interface SavedSideHustleHearing {
  id: string;
  revision: number;
  hearing: SideHustleHearing;
  lastAnsweredQuestionIndex: number;
  createdAt: string;
}
export interface SavedSideHustleProposal {
  id: string;
  hearingEventId: string;
  hearingRevision: number;
  contractVersion: string;
  screeningRuleVersion: string;
  promptVersion: string;
  usageKey: string;
  proposal: ValidatedSideHustleCandidateProposal;
  screening: SideHustleScreeningResult;
  createdAt: string;
}
export interface SavedSideHustleSelection {
  id: string;
  proposalEventId: string;
  candidateIndex: number;
  candidate: unknown;
  screeningEntry: unknown;
  createdAt: string;
}
export interface SavedSideHustleRoadmap {
  id: string;
  selectionEventId: string;
  operationId: string;
  promptVersion: string;
  usageKey: string;
  roadmap: SideHustleRoadmapProposal;
  createdAt: string;
}
export class PrismaSideHustleHearingRepository extends PrismaPersonalLearningRequestRepository {
  constructor(client: PrismaClient) {
    super(client);
  }

  private async assertPolicy(tx: Prisma.TransactionClient, actor: PersonalLearningActor) {
    const enrollment = await tx.programEnrollment.findFirst({
      where: {
        id: actor.scope.programEnrollmentId,
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        groupMembershipId: actor.scope.groupMembershipId,
      },
      select: { serviceProgramId: true },
    });
    const program =
      enrollment &&
      (await tx.serviceProgram.findFirst({
        where: {
          id: enrollment.serviceProgramId,
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          status: 'ACTIVE',
        },
        select: { settings: true },
      }));
    if (!program || personalLearningOfferPolicy(program.settings) !== 'SIDE_HUSTLE_V1')
      throw new ApplicationError('NOT_FOUND', 'side hustle unavailable');
  }

  async readState(actor: PersonalLearningActor) {
    return this.authorized(
      actor,
      true,
      async (tx) => {
        await this.normalLearner(tx, actor);
        await this.assertPolicy(tx, actor);
        const s = scopeOf(actor);
        const events = await tx.programActionEvent.findMany({
          where: {
            ...s,
            actorUserId: actor.scope.userId,
            eventType: { in: [HEARING, PROPOSAL, SELECTED, ROADMAP, STARTED] },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 300,
        });
        const latestHearing = events.find((event) => event.eventType === HEARING);
        const hearingMeta = latestHearing ? metadata(latestHearing.metadata) : null;
        const hearing =
          hearingMeta && typeof hearingMeta.revision === 'number'
            ? {
                id: latestHearing!.id,
                revision: hearingMeta.revision,
                hearing: validateSideHustleHearing(hearingMeta.hearing),
                createdAt: latestHearing!.occurredAt.toISOString(),
              }
            : null;
        const latestProposal = hearing
          ? events.find(
              (event) =>
                event.eventType === PROPOSAL &&
                metadata(event.metadata).hearingEventId === hearing.id,
            )
          : undefined;
        let proposalEvent = latestProposal;
        let proposalMeta = proposalEvent ? metadata(proposalEvent.metadata) : null;
        if (!proposalEvent && hearing) {
          const pending = events.find((event) => event.eventType === PROPOSAL);
          const pendingMeta = pending ? metadata(pending.metadata) : null;
          const revisionDelta =
            typeof pendingMeta?.hearingRevision === 'number'
              ? hearing.revision - pendingMeta.hearingRevision
              : -1;
          const pendingProposal = pendingMeta?.proposal as
            { status?: unknown; questions?: unknown } | undefined;
          const pendingQuestions = Array.isArray(pendingProposal?.questions)
            ? pendingProposal.questions
            : [];
          const answered = hearing.hearing.followUps.slice(-revisionDelta);
          if (
            pending &&
            pendingProposal?.status === 'NEEDS_CONTEXT' &&
            revisionDelta > 0 &&
            revisionDelta <= pendingQuestions.length &&
            answered.length === revisionDelta &&
            answered.every((item, index) => item.question === pendingQuestions[index])
          ) {
            proposalEvent = pending;
            proposalMeta = pendingMeta;
          }
        }
        let proposal =
          proposalMeta && proposalEvent
            ? projectProposal(
                proposalEvent.id,
                proposalMeta,
                proposalEvent.occurredAt.toISOString(),
              )
            : null;
        if (proposal && hearing) {
          const screening = screenSideHustleCandidates(
            hearing.hearing.conditions,
            proposal.proposal.candidates,
          );
          if (digest(proposal.screening) !== digest(screening)) conflict();
          proposal = { ...proposal, screening };
        }
        const latestSelection = events.find((event) => event.eventType === SELECTED);
        const selectionMeta = latestSelection ? metadata(latestSelection.metadata) : null;
        const selection =
          latestSelection && selectionMeta
            ? ({
                id: latestSelection.id,
                proposalEventId: String(selectionMeta.proposalEventId),
                candidateIndex: Number(selectionMeta.candidateIndex),
                candidate: selectionMeta.candidate,
                screeningEntry: selectionMeta.screeningEntry,
                createdAt: latestSelection.occurredAt.toISOString(),
              } satisfies SavedSideHustleSelection)
            : null;
        const roadmapEvent = selection
          ? events.find(
              (event) =>
                event.eventType === ROADMAP &&
                metadata(event.metadata).selectionEventId === selection.id,
            )
          : undefined;
        const roadmapMeta = roadmapEvent ? metadata(roadmapEvent.metadata) : null;
        const roadmap =
          roadmapEvent && roadmapMeta
            ? projectRoadmap(roadmapEvent.id, roadmapMeta, roadmapEvent.occurredAt.toISOString())
            : null;
        const startedEvent = selection
          ? events.find(
              (event) =>
                event.eventType === STARTED &&
                metadata(event.metadata).selectionEventId === selection.id,
            )
          : undefined;
        const startedMeta = startedEvent ? metadata(startedEvent.metadata) : null;
        const started =
          startedEvent && startedMeta
            ? {
                id: startedEvent.id,
                topicId: String(startedMeta.topicId),
                requestId: String(startedMeta.requestId),
                roadmapEventId: String(startedMeta.roadmapEventId),
                startedAt: startedEvent.occurredAt.toISOString(),
                pausedTopicIds: Array.isArray(startedMeta.pausedTopicIds)
                  ? startedMeta.pausedTopicIds.filter((id): id is string => typeof id === 'string')
                  : [],
              }
            : null;
        const activeSideHustleTopic = await tx.personalLearningTopic.findFirst({
          where: {
            ...actor.scope,
            status: 'ACTIVE',
            goalSnapshot: { path: ['kind'], equals: 'SIDE_HUSTLE' },
          },
          select: { id: true, title: true },
        });
        return {
          hearing,
          proposal,
          selection,
          roadmap,
          started,
          activeSideHustle: activeSideHustleTopic,
        };
      },
      true,
    );
  }

  async readProgress(actor: PersonalLearningActor, topicId: string) {
    const unscopedActor: PersonalLearningActor = {
      actorUserId: actor.actorUserId,
      scope: actor.scope,
    };
    return this.authorized(
      unscopedActor,
      true,
      async (tx, now) => {
        await this.normalLearner(tx, actor);
        await this.assertPolicy(tx, actor);
        const scope = actor.scope;
        const topic = await tx.personalLearningTopic.findFirst({
          where: { ...scope, id: topicId },
        });
        const snapshot = metadata(topic?.goalSnapshot ?? {});
        if (!topic || snapshot.kind !== 'SIDE_HUSTLE')
          throw new ApplicationError('NOT_FOUND', 'side hustle topic unavailable');
        const events = await tx.programActionEvent.findMany({
          where: {
            ...scopeOf(actor),
            actorUserId: actor.actorUserId,
            eventType: { in: [STARTED, STAGE_ADVANCED, CHECKIN] },
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        });
        const topicEvents = events.filter((event) => metadata(event.metadata).topicId === topicId);
        const start = topicEvents.find((event) => event.eventType === STARTED);
        if (!start) throw new ApplicationError('NOT_FOUND', 'side hustle start unavailable');
        const advancements = topicEvents.filter((event) => event.eventType === STAGE_ADVANCED);
        const latest = advancements.at(-1);
        const period = (latest ? metadata(latest.metadata).toPeriod : 'MONTH_1') as
          (typeof SIDE_HUSTLE_PERIODS)[number] | 'COMPLETED';
        const periodStartedAt = latest?.occurredAt ?? start.occurredAt;
        const verifiedPracticeCount = await tx.$queryRaw<{ count: bigint }[]>`
        WITH linked AS (
          SELECT a.id AS assignment_id, a.started_at,
            (a.display_snapshot #>> '{dynamicPractice,planRevision}')::int AS plan_revision,
            a.target_resource_id AS plan_id
          FROM program_mission_assignments a
          JOIN personal_learning_plan_revisions p
            ON p.workspace_id=a.workspace_id AND p.group_id=a.group_id
            AND p.program_enrollment_id=a.program_enrollment_id
            AND p.plan_id=a.target_resource_id
            AND p.revision=(a.display_snapshot #>> '{dynamicPractice,planRevision}')::int
            AND p.topic_id=${topicId}::uuid
            AND p.group_membership_id=${scope.groupMembershipId}::uuid
            AND p.user_id=${scope.userId}::uuid
          WHERE a.workspace_id=${scope.workspaceId}::uuid AND a.group_id=${scope.groupId}::uuid
            AND a.program_enrollment_id=${scope.programEnrollmentId}::uuid
            AND a.target_resource_type='PERSONAL_LEARNING_PLAN'
            AND a.rule_version='PERSONAL_LEARNING_PRACTICE_V1'
            AND a.display_snapshot #>> '{dynamicPractice,topicId}'=${topicId}
            AND a.display_snapshot #>> '{dynamicPractice,scope,userId}'=${scope.userId}
        ), ranked AS (
          SELECT a.mission_assignment_id,
            a.evaluation_status, a.evaluation,
            row_number() OVER (PARTITION BY a.mission_assignment_id ORDER BY
              COALESCE((a.answer::jsonb->>'revision')::int, 0) DESC, a.created_at DESC) AS rank
          FROM training_mission_answers a JOIN linked l ON l.assignment_id=a.mission_assignment_id
          WHERE a.workspace_id=${scope.workspaceId}::uuid AND a.group_id=${scope.groupId}::uuid
            AND a.program_enrollment_id=${scope.programEnrollmentId}::uuid AND a.user_id=${actor.actorUserId}::uuid
            AND a.created_at > ${periodStartedAt}
        )
        SELECT count(*)::bigint AS count FROM ranked
        WHERE rank=1 AND evaluation_status='READY'
          AND evaluation #>> '{review,state}'='CURRENT_STEP_EVIDENCE'
      `;
        const roadmapId =
          typeof snapshot.roadmapEventId === 'string' ? snapshot.roadmapEventId : null;
        const roadmapEvent = roadmapId
          ? await tx.programActionEvent.findFirst({
              where: { ...scopeOf(actor), id: roadmapId, eventType: ROADMAP },
            })
          : null;
        const roadmap = roadmapEvent
          ? projectRoadmap(
              roadmapEvent.id,
              metadata(roadmapEvent.metadata),
              roadmapEvent.occurredAt.toISOString(),
            ).roadmap
          : null;
        if (!roadmap) throw new ApplicationError('CONFLICT', 'side hustle roadmap unavailable');
        const eligibility = sideHustleCheckinEligibility({
          period,
          periodStartedAt,
          verifiedPracticeCount: Number(verifiedPracticeCount[0]?.count ?? 0),
          now,
        });
        const lastCheckin =
          topicEvents.filter((event) => event.eventType === CHECKIN).at(-1) ?? null;
        const latestRequest = await tx.personalLearningRequest.findFirst({
          where: { ...scope, topicId },
          orderBy: { revision: 'desc' },
          select: { revision: true },
        });
        return {
          topicId,
          requestRevision: latestRequest?.revision ?? 0,
          status: topic.status,
          period,
          periodStartedAt: periodStartedAt.toISOString(),
          verifiedPracticeCount: Number(verifiedPracticeCount[0]?.count ?? 0),
          eligibility,
          roadmap,
          lastCheckin: lastCheckin ? metadata(lastCheckin.metadata).checkin : null,
        };
      },
      true,
    );
  }

  async saveCheckin(input: {
    actor: PersonalLearningActor;
    operationId: string;
    checkin: unknown;
  }) {
    if (!/^[0-9a-f-]{36}$/i.test(input.operationId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid checkin operation');
    const topicIdForProgress = (input.checkin as { topicId?: unknown })?.topicId;
    if (typeof topicIdForProgress !== 'string')
      throw new ApplicationError('VALIDATION_ERROR', 'invalid checkin topic');
    const unscopedActor: PersonalLearningActor = {
      actorUserId: input.actor.actorUserId,
      scope: input.actor.scope,
    };
    const state: Awaited<ReturnType<typeof this.readProgress>> = await this.readProgress(
      unscopedActor,
      topicIdForProgress,
    );
    return this.authorized(
      unscopedActor,
      true,
      async (tx, now) => {
        await this.normalLearner(tx, input.actor);
        await this.assertPolicy(tx, input.actor);
        const scope = input.actor.scope;
        const topicId = (input.checkin as { topicId?: unknown })?.topicId;
        if (typeof topicId !== 'string')
          throw new ApplicationError('VALIDATION_ERROR', 'invalid checkin topic');
        const topic = await tx.personalLearningTopic.findFirst({
          where: { ...scope, id: topicId },
        });
        const snapshot = metadata(topic?.goalSnapshot ?? {});
        if (!topic || snapshot.kind !== 'SIDE_HUSTLE')
          throw new ApplicationError('NOT_FOUND', 'side hustle topic unavailable');
        if (topic.status !== 'ACTIVE')
          throw new ApplicationError('CONFLICT', 'side hustle topic paused');
        const requestedPeriod = (input.checkin as { period?: unknown }).period;
        const requestedIndex = SIDE_HUSTLE_PERIODS.indexOf(
          requestedPeriod as (typeof SIDE_HUSTLE_PERIODS)[number],
        );
        if (requestedIndex < 0)
          throw new ApplicationError('VALIDATION_ERROR', 'invalid checkin period');
        const content = validateSideHustleCheckin(
          input.checkin,
          state.roadmap.milestones[requestedIndex]?.checkpoints.length ?? 0,
        );
        const latestPeriodEvent = await tx.programActionEvent.findFirst({
          where: {
            ...scopeOf(input.actor),
            actorUserId: scope.userId,
            eventType: STAGE_ADVANCED,
            metadata: { path: ['topicId'], equals: topicId },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        const actualPeriod = latestPeriodEvent
          ? metadata(latestPeriodEvent.metadata).toPeriod
          : 'MONTH_1';
        if (actualPeriod !== state.period) conflict();
        const startEvent = await tx.programActionEvent.findFirst({
          where: {
            ...scopeOf(input.actor),
            actorUserId: scope.userId,
            eventType: STARTED,
            metadata: { path: ['topicId'], equals: topicId },
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        });
        if (!startEvent) throw new ApplicationError('NOT_FOUND', 'side hustle start unavailable');
        const currentPeriodStartedAt = latestPeriodEvent?.occurredAt ?? startEvent.occurredAt;
        const evidenceCount = await tx.$queryRaw<{ count: bigint }[]>`
          WITH linked AS (
            SELECT a.id AS assignment_id
            FROM program_mission_assignments a
            JOIN personal_learning_plan_revisions p
              ON p.workspace_id=a.workspace_id AND p.group_id=a.group_id
              AND p.program_enrollment_id=a.program_enrollment_id
              AND p.plan_id=a.target_resource_id
              AND p.revision=(a.display_snapshot #>> '{dynamicPractice,planRevision}')::int
              AND p.topic_id=${topicId}::uuid
              AND p.group_membership_id=${scope.groupMembershipId}::uuid
              AND p.user_id=${scope.userId}::uuid
            WHERE a.workspace_id=${scope.workspaceId}::uuid AND a.group_id=${scope.groupId}::uuid
              AND a.program_enrollment_id=${scope.programEnrollmentId}::uuid
              AND a.target_resource_type='PERSONAL_LEARNING_PLAN'
              AND a.rule_version='PERSONAL_LEARNING_PRACTICE_V1'
              AND a.display_snapshot #>> '{dynamicPractice,topicId}'=${topicId}
              AND a.display_snapshot #>> '{dynamicPractice,scope,userId}'=${scope.userId}
          ), ranked AS (
            SELECT a.mission_assignment_id, a.evaluation_status, a.evaluation,
              row_number() OVER (PARTITION BY a.mission_assignment_id ORDER BY
                COALESCE((a.answer::jsonb->>'revision')::int, 0) DESC, a.created_at DESC) AS rank
            FROM training_mission_answers a JOIN linked l ON l.assignment_id=a.mission_assignment_id
            WHERE a.workspace_id=${scope.workspaceId}::uuid AND a.group_id=${scope.groupId}::uuid
              AND a.program_enrollment_id=${scope.programEnrollmentId}::uuid
              AND a.user_id=${input.actor.actorUserId}::uuid AND a.created_at > ${currentPeriodStartedAt}
          )
          SELECT count(*)::bigint AS count FROM ranked
          WHERE rank=1 AND evaluation_status='READY'
            AND evaluation #>> '{review,state}'='CURRENT_STEP_EVIDENCE'
        `;
        const currentEligibility = sideHustleCheckinEligibility({
          period: state.period,
          periodStartedAt: currentPeriodStartedAt,
          verifiedPracticeCount: Number(evidenceCount[0]?.count ?? 0),
          now,
        });
        const key = `side-hustle-checkin:${input.operationId}`;
        const prior = await tx.programActionEvent.findFirst({
          where: { ...scopeOf(input.actor), actorUserId: scope.userId, idempotencyKey: key },
        });
        if (prior) {
          const meta = metadata(prior.metadata);
          if (
            prior.eventType !== CHECKIN ||
            meta.topicId !== topicId ||
            digest(meta.checkin) !== digest(content)
          )
            conflict();
          return {
            checkinEventId: prior.id,
            period: state.period,
            eligibility: currentEligibility,
            replayed: true,
          };
        }
        const matchingAdvance = await tx.programActionEvent.findFirst({
          where: {
            ...scopeOf(input.actor),
            actorUserId: scope.userId,
            eventType: STAGE_ADVANCED,
            metadata: { path: ['topicId'], equals: topicId },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        if (content.period !== state.period) {
          if (
            content.decision === 'ADVANCE' &&
            matchingAdvance &&
            metadata(matchingAdvance.metadata).fromPeriod === content.period
          )
            return {
              checkinEventId: String(metadata(matchingAdvance.metadata).checkinEventId),
              period: state.period,
              eligibility: currentEligibility,
              replayed: true,
            };
          conflict();
        }
        const allowed = currentEligibility;
        if (content.decision === 'ADVANCE' && !allowed.canAdvance)
          throw new ApplicationError('CONFLICT', 'side hustle stage not ready');
        const checkinEvent = await tx.programActionEvent.create({
          data: {
            ...scopeOf(input.actor),
            actorUserId: scope.userId,
            eventType: CHECKIN,
            idempotencyKey: key,
            occurredAt: now,
            metadata: {
              schemaVersion: 1,
              checkinVersion: SIDE_HUSTLE_CHECKIN_VERSION,
              topicId,
              period: content.period,
              checkin: content,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        if (content.decision !== 'ADVANCE')
          return {
            checkinEventId: checkinEvent.id,
            period: state.period,
            eligibility: currentEligibility,
            replayed: false,
          };
        const toPeriod =
          content.period === 'MONTH_1'
            ? 'MONTH_2'
            : content.period === 'MONTH_2'
              ? 'MONTH_3'
              : 'COMPLETED';
        const transitionKey = `side-hustle-stage:${topicId}:${content.period}:${toPeriod}`;
        const priorAdvance = await tx.programActionEvent.findFirst({
          where: {
            ...scopeOf(input.actor),
            idempotencyKey: transitionKey,
            eventType: STAGE_ADVANCED,
          },
        });
        if (priorAdvance)
          return {
            checkinEventId: checkinEvent.id,
            period: metadata(priorAdvance.metadata).toPeriod,
            eligibility: currentEligibility,
            replayed: true,
          };
        let requestRevision: number | null = null;
        let requestId: string | null = null;
        if (toPeriod !== 'COMPLETED') {
          const previous = await tx.personalLearningRequest.findFirst({
            where: { ...scope, topicId },
            orderBy: { revision: 'desc' },
          });
          if (!previous || previous.revision !== state.requestRevision) conflict();
          const request = buildSideHustleStageRequest({
            previous: {
              originalText: previous!.originalText,
              deviceType: previous!.deviceType as never,
              toolDescription: previous!.toolDescription,
              experienceDescription: previous!.experienceDescription,
              currentPosition: previous!.currentPosition,
            },
            roadmap: state.roadmap,
            toPeriod,
            checkpointResults: content.checkpointResults,
          });
          validateSavePersonalLearningRequest({
            actorUserId: input.actor.actorUserId,
            scope,
            topicId,
            content: request,
            expectedRevision: previous!.revision,
            idempotencyKey: transitionKey,
          });
          const requestDigest = createHash('sha256')
            .update(JSON.stringify({ expectedRevision: previous!.revision, ...request, topicId }))
            .digest('hex');
          const saved = await tx.personalLearningRequest.create({
            data: {
              ...scope,
              topicId,
              revision: previous!.revision + 1,
              ...request,
              idempotencyKey: transitionKey,
              digest: requestDigest,
            },
          });
          requestId = saved.id;
          requestRevision = saved.revision;
        }
        const advanced = await tx.programActionEvent.create({
          data: {
            ...scopeOf(input.actor),
            actorUserId: scope.userId,
            eventType: STAGE_ADVANCED,
            idempotencyKey: transitionKey,
            occurredAt: now,
            metadata: {
              schemaVersion: 1,
              topicId,
              roadmapEventId: snapshot.roadmapEventId,
              fromPeriod: content.period,
              toPeriod,
              checkinEventId: checkinEvent.id,
              requestId,
              requestRevision,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.personalLearningTopic.update({
          where: { id: topicId },
          data: {
            goalSnapshot: {
              ...snapshot,
              currentPeriod: toPeriod,
              currentPeriodStartedAt: now.toISOString(),
            },
          },
        });
        return {
          checkinEventId: checkinEvent.id,
          stageEventId: advanced.id,
          period: toPeriod,
          requestId,
          requestRevision,
          replayed: false,
        };
      },
      true,
    );
  }

  async saveHearing(input: {
    actor: PersonalLearningActor;
    hearing: unknown;
    expectedRevision: number;
    lastAnsweredQuestionIndex?: number;
    idempotencyKey: string;
  }) {
    const hearing = validateSideHustleHearing(input.hearing);
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid hearing revision');
    if (input.expectedRevision >= 100) conflict();
    const lastAnsweredQuestionIndex = input.lastAnsweredQuestionIndex ?? 0;
    if (
      !Number.isSafeInteger(lastAnsweredQuestionIndex) ||
      lastAnsweredQuestionIndex < 0 ||
      lastAnsweredQuestionIndex > 13
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid hearing position');
    const contentHash = digest({
      hearing,
      expectedRevision: input.expectedRevision,
      lastAnsweredQuestionIndex,
    });
    const previousContentHash = legacyDigest({
      hearing,
      expectedRevision: input.expectedRevision,
      lastAnsweredQuestionIndex,
    });
    return this.authorized(
      input.actor,
      true,
      async (tx, now) => {
        await this.normalLearner(tx, input.actor);
        await this.assertPolicy(tx, input.actor);
        const s = scopeOf(input.actor);
        const prior = await tx.programActionEvent.findFirst({
          where: { ...s, idempotencyKey: `side-hustle-hearing:${input.idempotencyKey}` },
        });
        if (prior) {
          const meta = metadata(prior.metadata);
          if (
            prior.actorUserId !== input.actor.scope.userId ||
            prior.eventType !== HEARING ||
            (meta.contentHash !== contentHash && meta.contentHash !== previousContentHash)
          )
            conflict();
          return projectHearing(prior.id, meta, prior.occurredAt.toISOString());
        }
        const latest = await tx.programActionEvent.findFirst({
          where: { ...s, actorUserId: input.actor.scope.userId, eventType: HEARING },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        const latestMeta = latest ? metadata(latest.metadata) : null;
        if (
          (typeof latestMeta?.revision === 'number' ? latestMeta.revision : 0) !==
          input.expectedRevision
        )
          conflict();
        const row = await tx.programActionEvent.create({
          data: {
            ...s,
            actorUserId: input.actor.scope.userId,
            eventType: HEARING,
            idempotencyKey: `side-hustle-hearing:${input.idempotencyKey}`,
            occurredAt: now,
            metadata: {
              schemaVersion: 1,
              hearingVersion: SIDE_HUSTLE_HEARING_VERSION,
              revision: input.expectedRevision + 1,
              lastAnsweredQuestionIndex,
              hearing,
              contentHash,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        return projectHearing(row.id, metadata(row.metadata), row.occurredAt.toISOString());
      },
      true,
    );
  }

  async saveProposal(input: {
    actor: PersonalLearningActor;
    hearingEventId: string;
    hearingRevision: number;
    proposal: unknown;
    screening: SideHustleScreeningResult;
    promptVersion: string;
    usageKey: string;
  }) {
    const proposal = parseStoredSideHustleCandidateProposal(input.proposal);
    if (
      input.screening.ruleVersion !== SIDE_HUSTLE_SCREENING_RULE_VERSION ||
      input.screening.candidateContractVersion !== SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION ||
      !/^personal-learning-operation:[0-9a-f]{64}$/.test(input.usageKey)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid proposal provenance');
    return this.authorized(
      input.actor,
      true,
      async (tx, now) => {
        await this.normalLearner(tx, input.actor);
        const s = scopeOf(input.actor);
        const hearingRow = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: input.actor.scope.userId,
            id: input.hearingEventId,
            eventType: HEARING,
          },
        });
        const hm = hearingRow ? metadata(hearingRow.metadata) : null;
        if (!hearingRow || hm?.revision !== input.hearingRevision)
          throw new ApplicationError('CONFLICT', 'side hustle hearing changed');
        const currentHearing = hearingRow;
        const hearing = validateSideHustleHearing(hm?.hearing);
        const computedScreening = screenSideHustleCandidates(
          hearing.conditions,
          proposal.candidates,
        );
        if (digest(input.screening) !== digest(computedScreening))
          throw new ApplicationError('VALIDATION_ERROR', 'proposal screening mismatch');
        const latest = await tx.programActionEvent.findFirst({
          where: { ...s, actorUserId: input.actor.scope.userId, eventType: HEARING },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        if (latest?.id !== currentHearing.id) conflict();
        const existing = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: input.actor.scope.userId,
            eventType: PROPOSAL,
            metadata: { path: ['hearingEventId'], equals: currentHearing.id },
          },
        });
        if (existing)
          return projectProposal(
            existing.id,
            metadata(existing.metadata),
            existing.occurredAt.toISOString(),
          );
        const usage = await tx.aiUsageEvent.findFirst({
          where: {
            workspaceId: s.workspaceId,
            actorUserId: input.actor.scope.userId,
            idempotencyKey: input.usageKey,
            status: 'SUCCESS',
            taskType: 'PERSONAL_LEARNING_SIDE_HUSTLE_PROPOSAL',
            estimatedCostUsdMicros: { not: null },
            promptVersion: input.promptVersion,
          },
        });
        if (!usage) throw new ApplicationError('CONFLICT', 'durable proposal usage required');
        const row = await tx.programActionEvent.create({
          data: {
            ...s,
            actorUserId: input.actor.scope.userId,
            eventType: PROPOSAL,
            idempotencyKey: `side-hustle-proposal:${currentHearing.id}`,
            occurredAt: now,
            metadata: {
              schemaVersion: 1,
              hearingEventId: currentHearing.id,
              hearingRevision: input.hearingRevision,
              contractVersion: SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION,
              screeningRuleVersion: input.screening.ruleVersion,
              promptVersion: input.promptVersion,
              usageKey: input.usageKey,
              proposal,
              screening: input.screening,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        return projectProposal(row.id, metadata(row.metadata), row.occurredAt.toISOString());
      },
      true,
    );
  }

  async select(input: {
    actor: PersonalLearningActor;
    proposalEventId: string;
    candidateIndex: number;
    idempotencyKey: string;
  }) {
    if (
      !Number.isSafeInteger(input.candidateIndex) ||
      input.candidateIndex < 0 ||
      !/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid selection');
    return this.authorized(
      input.actor,
      true,
      async (tx, now) => {
        await this.normalLearner(tx, input.actor);
        await this.assertPolicy(tx, input.actor);
        const s = scopeOf(input.actor);
        const proposalEvent = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: input.actor.scope.userId,
            id: input.proposalEventId,
            eventType: PROPOSAL,
          },
        });
        if (!proposalEvent) throw new ApplicationError('CONFLICT', 'side hustle proposal changed');
        const selectedProposalEvent = proposalEvent;
        const pm = metadata(proposalEvent.metadata);
        const latestHearing = await tx.programActionEvent.findFirst({
          where: { ...s, actorUserId: input.actor.scope.userId, eventType: HEARING },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        const latestProposal =
          latestHearing &&
          (await tx.programActionEvent.findFirst({
            where: {
              ...s,
              actorUserId: input.actor.scope.userId,
              eventType: PROPOSAL,
              metadata: { path: ['hearingEventId'], equals: latestHearing.id },
            },
          }));
        if (
          !latestHearing ||
          pm.hearingEventId !== latestHearing.id ||
          latestProposal?.id !== selectedProposalEvent.id
        )
          throw new ApplicationError('CONFLICT', 'side hustle proposal changed');
        const currentHearingEvent = latestHearing;
        const proposal = parseStoredSideHustleCandidateProposal(pm.proposal);
        if (proposal.status !== 'READY' || input.candidateIndex >= proposal.candidates.length)
          throw new ApplicationError('VALIDATION_ERROR', 'candidate unavailable');
        const hearingMeta = metadata(currentHearingEvent.metadata);
        const hearing = validateSideHustleHearing(hearingMeta.hearing);
        const screening = screenSideHustleCandidates(hearing.conditions, proposal.candidates);
        const screeningEntry = screening.entries.find(
          (entry) => entry.candidateIndex === input.candidateIndex,
        );
        if (!screeningEntry || !['FIT', 'CAUTION'].includes(screeningEntry.verdict))
          throw new ApplicationError('VALIDATION_ERROR', 'candidate excluded');
        const key = `side-hustle-selection:${input.idempotencyKey}`;
        const prior = await tx.programActionEvent.findFirst({
          where: { ...s, idempotencyKey: key },
        });
        if (prior) {
          const p = metadata(prior.metadata);
          if (
            prior.actorUserId !== input.actor.scope.userId ||
            prior.eventType !== SELECTED ||
            p.proposalEventId !== input.proposalEventId ||
            p.candidateIndex !== input.candidateIndex
          )
            conflict();
          return {
            id: prior.id,
            proposalEventId: input.proposalEventId,
            candidateIndex: input.candidateIndex,
            candidate: p.candidate,
            screeningEntry: p.screeningEntry,
            createdAt: prior.occurredAt.toISOString(),
          } satisfies SavedSideHustleSelection;
        }
        const row = await tx.programActionEvent.create({
          data: {
            ...s,
            actorUserId: input.actor.scope.userId,
            eventType: SELECTED,
            idempotencyKey: key,
            occurredAt: now,
            metadata: {
              schemaVersion: 1,
              proposalEventId: input.proposalEventId,
              candidateIndex: input.candidateIndex,
              candidate: proposal.candidates[input.candidateIndex],
              screeningEntry,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        return {
          id: row.id,
          proposalEventId: input.proposalEventId,
          candidateIndex: input.candidateIndex,
          candidate: proposal.candidates[input.candidateIndex],
          screeningEntry,
          createdAt: row.occurredAt.toISOString(),
        } satisfies SavedSideHustleSelection;
      },
      true,
    );
  }

  async saveRoadmap(input: {
    actor: PersonalLearningActor;
    selectionEventId: string;
    roadmap: unknown;
    promptVersion: string;
    usageKey: string;
    idempotencyKey: string;
  }) {
    if (
      !/^[0-9a-f-]{36}$/i.test(input.selectionEventId) ||
      !/^[0-9a-f-]{36}$/i.test(input.idempotencyKey) ||
      input.promptVersion !== 'side-hustle-roadmap-v1' ||
      !/^personal-learning-operation:[0-9a-f]{64}$/.test(input.usageKey)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid roadmap provenance');
    return this.authorized(
      input.actor,
      true,
      async (tx, now) => {
        await this.normalLearner(tx, input.actor);
        await this.assertPolicy(tx, input.actor);
        const s = scopeOf(input.actor);
        const selected = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: input.actor.scope.userId,
            id: input.selectionEventId,
            eventType: SELECTED,
          },
        });
        const latest = await tx.programActionEvent.findFirst({
          where: { ...s, actorUserId: input.actor.scope.userId, eventType: SELECTED },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        if (!selected || latest?.id !== selected.id) conflict();
        const selectedEvent = selected!;
        const selectedMeta = metadata(selectedEvent.metadata);
        const selectedCandidate = selectedMeta.candidate as SideHustleCandidate;
        const selectedProposal = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: input.actor.scope.userId,
            id: String(selectedMeta.proposalEventId),
            eventType: PROPOSAL,
          },
        });
        const hearingEventId = selectedProposal
          ? metadata(selectedProposal.metadata).hearingEventId
          : null;
        const hearingEvent =
          typeof hearingEventId === 'string'
            ? await tx.programActionEvent.findFirst({
                where: {
                  ...s,
                  actorUserId: input.actor.scope.userId,
                  id: hearingEventId,
                  eventType: HEARING,
                },
              })
            : null;
        if (!hearingEvent || !Number.isSafeInteger(selectedCandidate.weeklyHoursMin)) conflict();
        const hearing = validateSideHustleHearing(metadata(hearingEvent!.metadata).hearing);
        const maxWeeklyHours = hearing.conditions.weeklyHours ?? selectedCandidate.weeklyHoursMin;
        const roadmap = validateSideHustleRoadmapProposal(input.roadmap, {
          weeklyHours: maxWeeklyHours,
        });
        const existing = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: input.actor.scope.userId,
            eventType: ROADMAP,
            idempotencyKey: `side-hustle-roadmap:${input.idempotencyKey}`,
          },
        });
        if (existing) {
          const meta = metadata(existing.metadata);
          if (
            meta.selectionEventId !== input.selectionEventId ||
            digest(meta.roadmap) !== digest(roadmap)
          )
            conflict();
          return projectRoadmap(existing.id, meta, existing.occurredAt.toISOString());
        }
        const usage = await tx.aiUsageEvent.findFirst({
          where: {
            workspaceId: s.workspaceId,
            actorUserId: input.actor.scope.userId,
            idempotencyKey: input.usageKey,
            status: 'SUCCESS',
            estimatedCostUsdMicros: { not: null },
            promptVersion: input.promptVersion,
            taskType: 'PERSONAL_LEARNING_SIDE_HUSTLE_ROADMAP',
          },
        });
        if (!usage) conflict();
        const row = await tx.programActionEvent.create({
          data: {
            ...s,
            actorUserId: input.actor.scope.userId,
            eventType: ROADMAP,
            idempotencyKey: `side-hustle-roadmap:${input.idempotencyKey}`,
            occurredAt: now,
            metadata: {
              schemaVersion: 1,
              selectionEventId: input.selectionEventId,
              roadmapContractVersion: 'SIDE_HUSTLE_ROADMAP_V1',
              operationId: input.idempotencyKey,
              promptVersion: input.promptVersion,
              usageKey: input.usageKey,
              roadmap,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        return projectRoadmap(row.id, metadata(row.metadata), row.occurredAt.toISOString());
      },
      true,
    );
  }

  async start(input: {
    actor: PersonalLearningActor;
    selectionEventId: string;
    roadmapEventId: string;
    idempotencyKey: string;
  }) {
    if (
      ![input.selectionEventId, input.roadmapEventId, input.idempotencyKey].every((id) =>
        /^[0-9a-f-]{36}$/i.test(id),
      )
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid side hustle start');
    return this.authorized(
      input.actor,
      true,
      async (tx, now) => {
        await this.normalLearner(tx, input.actor);
        await this.assertPolicy(tx, input.actor);
        const scope = input.actor.scope;
        const s = scopeOf(input.actor);
        const key = `side-hustle-start:${input.idempotencyKey}`;
        const prior = await tx.programActionEvent.findFirst({
          where: { ...s, idempotencyKey: key },
        });
        if (prior) {
          const meta = metadata(prior.metadata);
          if (
            prior.actorUserId !== scope.userId ||
            prior.eventType !== STARTED ||
            meta.selectionEventId !== input.selectionEventId ||
            meta.roadmapEventId !== input.roadmapEventId
          )
            conflict();
          return {
            id: prior.id,
            topicId: String(meta.topicId),
            requestId: String(meta.requestId),
            roadmapEventId: input.roadmapEventId,
            startedAt: prior.occurredAt.toISOString(),
            pausedTopicIds: Array.isArray(meta.pausedTopicIds) ? meta.pausedTopicIds : [],
          };
        }
        const existingStart = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: scope.userId,
            eventType: STARTED,
            AND: [
              {
                metadata: {
                  path: ['selectionEventId'],
                  equals: input.selectionEventId,
                },
              },
              {
                metadata: {
                  path: ['roadmapEventId'],
                  equals: input.roadmapEventId,
                },
              },
            ],
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        if (existingStart) {
          const meta = metadata(existingStart.metadata);
          return {
            id: existingStart.id,
            topicId: String(meta.topicId),
            requestId: String(meta.requestId),
            roadmapEventId: input.roadmapEventId,
            startedAt: existingStart.occurredAt.toISOString(),
            pausedTopicIds: Array.isArray(meta.pausedTopicIds) ? meta.pausedTopicIds : [],
          };
        }
        const selectionEvent = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: scope.userId,
            id: input.selectionEventId,
            eventType: SELECTED,
          },
        });
        const latestSelection = await tx.programActionEvent.findFirst({
          where: { ...s, actorUserId: scope.userId, eventType: SELECTED },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        const roadmapEvent = await tx.programActionEvent.findFirst({
          where: { ...s, actorUserId: scope.userId, id: input.roadmapEventId, eventType: ROADMAP },
        });
        const latestRoadmap = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: scope.userId,
            eventType: ROADMAP,
            metadata: { path: ['selectionEventId'], equals: input.selectionEventId },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        });
        if (
          !selectionEvent ||
          latestSelection?.id !== selectionEvent.id ||
          !roadmapEvent ||
          latestRoadmap?.id !== roadmapEvent.id ||
          metadata(roadmapEvent.metadata).selectionEventId !== input.selectionEventId
        )
          return conflict();
        const currentSelection = selectionEvent;
        const currentRoadmap = roadmapEvent;
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: scope.programEnrollmentId,
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
          },
          select: { serviceProgramId: true },
        });
        const program = enrollment
          ? await tx.serviceProgram.findFirst({
              where: {
                id: enrollment.serviceProgramId,
                workspaceId: scope.workspaceId,
                groupId: scope.groupId,
              },
              select: { settings: true },
            })
          : null;
        if (!personalLearningFeatureEnabled(program?.settings, 'multiTopic'))
          throw new ApplicationError('CONFIGURATION_ERROR', 'multi-topic learning is required');
        if ((await tx.personalLearningRequest.count({ where: { ...scope, topicId: null } })) > 0)
          throw new ApplicationError('CONFLICT', 'unscoped learning requests exist');
        const selectedMeta = metadata(currentSelection.metadata);
        const candidate = selectedMeta.candidate as SideHustleCandidate;
        const proposalEvent = await tx.programActionEvent.findFirst({
          where: {
            ...s,
            actorUserId: scope.userId,
            id: String(selectedMeta.proposalEventId),
            eventType: PROPOSAL,
          },
        });
        const hearingEventId = proposalEvent
          ? metadata(proposalEvent.metadata).hearingEventId
          : null;
        const hearingEvent =
          typeof hearingEventId === 'string'
            ? await tx.programActionEvent.findFirst({
                where: { ...s, actorUserId: scope.userId, id: hearingEventId, eventType: HEARING },
              })
            : null;
        if (!proposalEvent || !hearingEvent) return conflict();
        const currentHearingEvent = hearingEvent;
        const proposalRoadmap = projectRoadmap(
          currentRoadmap.id,
          metadata(currentRoadmap.metadata),
          currentRoadmap.occurredAt.toISOString(),
        );
        const hearing = validateSideHustleHearing(metadata(currentHearingEvent.metadata).hearing);
        const requestContent = buildSideHustleInitialRequest({
          candidate,
          hearing,
          roadmap: proposalRoadmap.roadmap,
        });
        const activeSideHustle = await tx.personalLearningTopic.findMany({
          where: {
            ...scope,
            status: 'ACTIVE',
            goalSnapshot: { path: ['kind'], equals: 'SIDE_HUSTLE' },
          },
          select: { id: true },
        });
        const pausedTopicIds = activeSideHustle.map(({ id }) => id);
        if (pausedTopicIds.length)
          await tx.personalLearningTopic.updateMany({
            where: { ...scope, id: { in: pausedTopicIds }, status: 'ACTIVE' },
            data: { status: 'PAUSED', endedAt: now },
          });
        const activeCount = await tx.personalLearningTopic.count({
          where: { ...scope, status: 'ACTIVE' },
        });
        if (activeCount >= 3) throw new ApplicationError('CONFLICT', 'active topic limit reached');
        const requestKey = `side-hustle-start:${input.idempotencyKey}`;
        validateSavePersonalLearningRequest({
          actorUserId: input.actor.actorUserId,
          scope: input.actor.scope,
          content: requestContent,
          expectedRevision: 0,
          idempotencyKey: requestKey,
        });
        const requestDigest = createHash('sha256')
          .update(
            JSON.stringify({
              expectedRevision: 0,
              originalText: requestContent.originalText,
              deviceType: requestContent.deviceType,
              toolDescription: requestContent.toolDescription,
              experienceDescription: requestContent.experienceDescription,
              currentPosition: requestContent.currentPosition,
              topicId: null,
            }),
          )
          .digest('hex');
        const topic = await tx.personalLearningTopic.create({
          data: {
            ...scope,
            title: candidate.name,
            status: 'ACTIVE',
            lastLearnerUseAt: now,
            goalSnapshot: {
              kind: 'SIDE_HUSTLE',
              schemaVersion: 1,
              selectionEventId: input.selectionEventId,
              roadmapEventId: input.roadmapEventId,
              candidate,
              roadmap: proposalRoadmap.roadmap,
              startedAt: now.toISOString(),
              currentPeriod: 'MONTH_1',
              currentPeriodStartedAt: now.toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });
        const request = await tx.personalLearningRequest.create({
          data: {
            ...scope,
            topicId: topic.id,
            revision: 1,
            ...requestContent,
            idempotencyKey: requestKey,
            digest: requestDigest,
          },
        });
        await tx.personalLearningTopic.update({
          where: { id: topic.id },
          data: { sourceRequestId: request.id },
        });
        const row = await tx.programActionEvent.create({
          data: {
            ...s,
            actorUserId: scope.userId,
            eventType: STARTED,
            idempotencyKey: key,
            occurredAt: now,
            metadata: {
              schemaVersion: 1,
              selectionEventId: input.selectionEventId,
              roadmapEventId: input.roadmapEventId,
              topicId: topic.id,
              requestId: request.id,
              pausedTopicIds,
            },
          },
        });
        return {
          id: row.id,
          topicId: topic.id,
          requestId: request.id,
          roadmapEventId: input.roadmapEventId,
          startedAt: now.toISOString(),
          pausedTopicIds,
        };
      },
      true,
    );
  }
}

const projectHearing = (
  id: string,
  meta: Record<string, unknown>,
  createdAt: string,
): SavedSideHustleHearing => {
  if (meta.hearingVersion !== SIDE_HUSTLE_HEARING_VERSION || typeof meta.revision !== 'number')
    conflict();
  return {
    id,
    revision: Number(meta.revision),
    hearing: validateSideHustleHearing(meta.hearing),
    lastAnsweredQuestionIndex:
      typeof meta.lastAnsweredQuestionIndex === 'number' &&
      Number.isSafeInteger(meta.lastAnsweredQuestionIndex) &&
      meta.lastAnsweredQuestionIndex >= 0 &&
      meta.lastAnsweredQuestionIndex <= 13
        ? meta.lastAnsweredQuestionIndex
        : Math.max(0, Math.min(12, Number(meta.revision) - 1)),
    createdAt,
  };
};
const projectProposal = (
  id: string,
  meta: Record<string, unknown>,
  createdAt: string,
): SavedSideHustleProposal => {
  if (
    meta.contractVersion !== SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION ||
    typeof meta.hearingEventId !== 'string' ||
    typeof meta.hearingRevision !== 'number' ||
    typeof meta.promptVersion !== 'string' ||
    typeof meta.usageKey !== 'string' ||
    !meta.screening ||
    typeof meta.screening !== 'object'
  )
    conflict();
  return {
    id,
    hearingEventId: String(meta.hearingEventId),
    hearingRevision: Number(meta.hearingRevision),
    contractVersion: SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION,
    screeningRuleVersion: String(meta.screeningRuleVersion),
    promptVersion: String(meta.promptVersion),
    usageKey: String(meta.usageKey),
    proposal: parseStoredSideHustleCandidateProposal(meta.proposal),
    screening: meta.screening as SideHustleScreeningResult,
    createdAt,
  };
};

const projectRoadmap = (
  id: string,
  meta: Record<string, unknown>,
  createdAt: string,
): SavedSideHustleRoadmap => {
  if (
    meta.roadmapContractVersion !== 'SIDE_HUSTLE_ROADMAP_V1' ||
    typeof meta.operationId !== 'string' ||
    typeof meta.selectionEventId !== 'string' ||
    typeof meta.promptVersion !== 'string' ||
    typeof meta.usageKey !== 'string'
  )
    conflict();
  return {
    id,
    selectionEventId: meta.selectionEventId as string,
    operationId: meta.operationId as string,
    promptVersion: meta.promptVersion as string,
    usageKey: meta.usageKey as string,
    roadmap: validateSideHustleRoadmapProposal(meta.roadmap, { weeklyHours: null }),
    createdAt,
  };
};
