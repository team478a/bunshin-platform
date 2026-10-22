import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { PersonalLearningActor } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import {
  personalLearningOfferPolicy,
  SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION,
  SIDE_HUSTLE_HEARING_VERSION,
  SIDE_HUSTLE_SCREENING_RULE_VERSION,
  validateSideHustleHearing,
  parseStoredSideHustleCandidateProposal,
  screenSideHustleCandidates,
  type SideHustleHearing,
  type SideHustleScreeningResult,
  type ValidatedSideHustleCandidateProposal,
} from '@bunshin/capability-training';
import { PrismaPersonalLearningRequestRepository } from './personal-learning-request';

const HEARING = 'SIDE_HUSTLE_HEARING_SAVED';
const PROPOSAL = 'SIDE_HUSTLE_PROPOSAL_SAVED';
const SELECTED = 'SIDE_HUSTLE_SELECTED';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
            eventType: { in: [HEARING, PROPOSAL, SELECTED] },
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
        return { hearing, proposal, selection };
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
      lastAnsweredQuestionIndex > 12
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid hearing position');
    const contentHash = digest({
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
            meta.contentHash !== contentHash
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
      Number.isSafeInteger(meta.lastAnsweredQuestionIndex)
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
