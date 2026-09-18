import type { NextActionPolicy } from '@bunshin/application';
import type { AiResaleV1DecisionContext, ResaleActionKey, ResaleReactionState } from './index';
import { ResalePersistenceError } from './persistence';
import {
  isDaySevenClassificationDue,
  renderAiResaleFallback,
  type AiResaleActionDisplaySnapshot,
  type AiResaleRuntimeCandidate,
  type AiResaleRuntimeRepository,
  type AiResaleRuntimeWriteResult,
} from './runtime';

export const AI_RESALE_RESULT_STATUSES = ['DONE', 'PARTIAL', 'NOT_DONE'] as const;
export type AiResaleResultStatus = (typeof AI_RESALE_RESULT_STATUSES)[number];

export interface AiResaleParticipantAction {
  id: string;
  sequence: number;
  actionKey: ResaleActionKey;
  mode: 'WORK' | 'WAIT';
  status: 'PRESENTED' | 'STARTED' | 'COMPLETED' | 'SKIPPED';
  display: AiResaleActionDisplaySnapshot;
  targetResourceId: string | null;
  presentedAt: Date;
  reevaluateAt: Date | null;
}

export interface AiResaleParticipantState {
  enrollmentId: string;
  programName: string;
  enrollmentStatus: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  policyKey: 'FREE_7D' | 'PAID_90D';
  programDay: number;
  startsAt: Date;
  endsAt: Date | null;
  classification: 'NOT_STARTED' | 'PARTIAL' | 'LISTED' | null;
  action: AiResaleParticipantAction | null;
}

export interface AiResaleActionResultInput {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  programEnrollmentId: string;
  assignmentId: string;
  resultStatus: AiResaleResultStatus;
  idempotencyKey: string;
  itemTitle: string | null;
  reactionState: Extract<ResaleReactionState, 'NO_REACTION' | 'REACTION' | 'SOLD'> | null;
  improvementType: string | null;
  soldPriceYen: number | null;
  note: string | null;
  occurredAt: Date;
}

export interface AiResaleParticipantRepository {
  findState(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    now: Date;
  }): Promise<AiResaleParticipantState | null>;
  findAction(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    assignmentId: string;
  }): Promise<AiResaleParticipantAction | null>;
  applyResult(input: AiResaleActionResultInput): Promise<AiResaleRuntimeWriteResult>;
}

const requiredText = (value: string | null, field: string, max: number) => {
  const normalized = value?.trim() ?? '';
  if (!normalized || normalized.length > max) {
    throw new ResalePersistenceError('VALIDATION_ERROR', `invalid ${field}`);
  }
  return normalized;
};

function validateResult(action: AiResaleParticipantAction, input: AiResaleActionResultInput) {
  if (action.mode === 'WAIT') {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'WAIT does not accept a result');
  }
  if (!AI_RESALE_RESULT_STATUSES.includes(input.resultStatus)) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'invalid resultStatus');
  }
  if (input.note !== null && input.note.trim().length > 500) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'invalid note');
  }
  if (input.resultStatus !== 'DONE') return;
  if (['ITEM_FIND', 'NEXT_ITEM'].includes(action.actionKey)) {
    requiredText(input.itemTitle, 'itemTitle', 160);
  }
  if (action.actionKey === 'CHECK' && input.reactionState === null) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'reactionState is required');
  }
  if (input.soldPriceYen !== null && input.reactionState !== 'SOLD') {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'soldPriceYen requires a sale');
  }
  if (action.actionKey === 'IMPROVE') {
    requiredText(input.improvementType, 'improvementType', 80);
  }
  if (
    input.soldPriceYen !== null &&
    (!Number.isInteger(input.soldPriceYen) || input.soldPriceYen < 0)
  ) {
    throw new ResalePersistenceError('VALIDATION_ERROR', 'invalid soldPriceYen');
  }
}

function decisionContext(
  candidate: AiResaleRuntimeCandidate,
  now: Date,
): AiResaleV1DecisionContext {
  return {
    now,
    policyKey: candidate.settings.policyKey,
    programDay: candidate.programDay,
    programState: candidate.programState,
    activityBaselineAt: candidate.activityBaselineAt,
    lastUserActionAt: candidate.lastUserActionAt,
    pauseAfterDays: candidate.settings.pauseAfterDays,
    defaultWaitHours: candidate.settings.defaultWaitHours,
    items: candidate.items,
  };
}

function daySevenClassification(candidate: AiResaleRuntimeCandidate) {
  if (
    candidate.items.some((item) => item.listedAt !== null) ||
    candidate.eventTypes.includes('FIRST_LISTING')
  ) {
    return 'LISTED' as const;
  }
  if (
    candidate.eventTypes.some((eventType) =>
      [
        'ACTION_STARTED',
        'ACTION_COMPLETED',
        'ACTION_PARTIAL',
        'ACTION_NOT_COMPLETED',
        'HELP_REQUESTED',
      ].includes(eventType),
    )
  ) {
    return 'PARTIAL' as const;
  }
  return 'NOT_STARTED' as const;
}

export class AiResaleParticipantService {
  constructor(
    private readonly participantRepository: AiResaleParticipantRepository,
    private readonly runtimeRepository: AiResaleRuntimeRepository,
    private readonly policy: NextActionPolicy<AiResaleV1DecisionContext>,
  ) {}

  private async evaluate(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    now: Date;
  }) {
    const candidate = await this.runtimeRepository.findCandidate(input);
    if (candidate === null) return;
    if (isDaySevenClassificationDue(candidate)) {
      await this.runtimeRepository.persistDaySevenClassification({
        candidate,
        classification: daySevenClassification(candidate),
        evaluatedAt: input.now,
      });
      return;
    }
    const decision = this.policy.evaluate(decisionContext(candidate, input.now));
    await this.runtimeRepository.persistDecision({
      candidate,
      decision,
      displaySnapshot: renderAiResaleFallback(decision),
      evaluatedAt: input.now,
    });
  }

  async current(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    now: Date;
  }) {
    let state = await this.participantRepository.findState(input);
    if (state === null) {
      throw new ResalePersistenceError('NOT_FOUND', 'AI resale enrollment not found');
    }
    if (state.enrollmentStatus === 'ACTIVE' && state.action === null) {
      await this.evaluate(input);
      state = await this.participantRepository.findState(input);
      if (state === null) {
        throw new ResalePersistenceError('NOT_FOUND', 'AI resale enrollment not found');
      }
    }
    return state;
  }

  async submit(input: AiResaleActionResultInput) {
    const action = await this.participantRepository.findAction(input);
    if (action === null) {
      throw new ResalePersistenceError('NOT_FOUND', 'AI resale action not found');
    }
    validateResult(action, input);
    const result = await this.participantRepository.applyResult({
      ...input,
      itemTitle: input.itemTitle?.trim() || null,
      improvementType: input.improvementType?.trim() || null,
      note: input.note?.trim() || null,
    });
    if (result === 'NOT_FOUND') {
      throw new ResalePersistenceError('NOT_FOUND', 'AI resale action not found');
    }
    if (result === 'STALE') {
      throw new ResalePersistenceError('CONFLICT', 'AI resale action was updated');
    }
    const stateInput = {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      actorUserId: input.actorUserId,
      programEnrollmentId: input.programEnrollmentId,
      now: input.occurredAt,
    };
    let state = await this.participantRepository.findState(stateInput);
    if (state === null) {
      throw new ResalePersistenceError('NOT_FOUND', 'AI resale enrollment not found');
    }
    if (state.enrollmentStatus === 'ACTIVE' && state.action === null) {
      await this.evaluate(stateInput);
      state = await this.participantRepository.findState(stateInput);
      if (state === null) {
        throw new ResalePersistenceError('NOT_FOUND', 'AI resale enrollment not found');
      }
    }
    return { result, state };
  }
}
