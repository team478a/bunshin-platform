import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningActor } from './personal-learning-persistence';
import { validatePersonalLearningActor } from './personal-learning-persistence';
import type { PersonalLearningPractice } from './personal-learning-practice';

export const PRACTICE_SUPPORT_REASONS = [
  'UNDERSTANDING',
  'NEXT_ACTION',
  'ENVIRONMENT_MISMATCH',
  'FEATURE_UNAVAILABLE',
  'OUTPUT_MISMATCH',
  'WORKLOAD',
  'UNKNOWN',
] as const;
export type PracticeSupportReason = (typeof PRACTICE_SUPPORT_REASONS)[number];
export const PRACTICE_SUPPORT_VERSION = 'PERSONAL_LEARNING_SUPPORT_V1';
export interface PracticeSupportAdvice {
  cause: PracticeSupportReason;
  explanation: string;
  nextAction: string;
  question: string;
}
export interface PracticeSupportCommand {
  actor: PersonalLearningActor;
  assignmentId: string;
  operationId: string;
  expectedNoteRevision: number;
  expectedSupportRevision: number;
  reason: PracticeSupportReason;
  text: string;
}
export interface SavedPracticeSupport {
  id: string;
  operationId: string;
  revision: number;
  noteRevision: number;
  candidateId: string;
  materialVersion: 1;
  reason: PracticeSupportReason;
  text: string;
  requestedAt: string;
  status: 'PENDING' | 'READY' | 'FAILED' | 'STALE';
  advice: PracticeSupportAdvice | null;
  promptVersion: string | null;
  usageKey: string | null;
}
export interface PracticeSupportState {
  revision: number;
  history: SavedPracticeSupport[];
}
export interface PracticeSupportRepository {
  prepareSupport(input: PracticeSupportCommand): Promise<{
    practice: PersonalLearningPractice;
    request: SavedPracticeSupport;
    created: boolean;
  }>;
  completeSupport(input: {
    command: PracticeSupportCommand;
    requestId: string;
    advice: PracticeSupportAdvice;
    usageKey: string;
    promptVersion: string;
  }): Promise<PersonalLearningPractice>;
  failSupport(input: { command: PracticeSupportCommand; requestId: string }): Promise<void>;
}
export function validatePracticeSupportCommand(input: PracticeSupportCommand) {
  validatePersonalLearningActor(input.actor);
  const uuid = (v: unknown) =>
    typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
  if (
    !uuid(input.assignmentId) ||
    !uuid(input.operationId) ||
    !PRACTICE_SUPPORT_REASONS.includes(input.reason) ||
    typeof input.text !== 'string' ||
    input.text !== input.text.trim() ||
    !input.text ||
    input.text.length > 500 ||
    ![input.expectedNoteRevision, input.expectedSupportRevision].every(
      (v) => Number.isSafeInteger(v) && v >= 0 && v < 1000,
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid practice support input');
}
/** Shape / policy constraints, not a guarantee of advice quality or learner achievement. */
export function validatePracticeSupportAdvice(value: unknown): PracticeSupportAdvice {
  const fail = (): never => {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid practice support advice');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  const keys = ['cause', 'explanation', 'nextAction', 'question'];
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k)) ||
    !PRACTICE_SUPPORT_REASONS.includes(v.cause as PracticeSupportReason) ||
    ['explanation', 'nextAction', 'question'].some(
      (k) => typeof v[k] !== 'string' || (v[k] as string).length > 600,
    ) ||
    !(v.explanation as string).trim()
  )
    return fail();
  // Unknown cause is a question, not an invented diagnosis or speculative UI instruction.
  if (
    v.cause === 'UNKNOWN'
      ? !(v.question as string).trim() || v.nextAction !== ''
      : !(v.nextAction as string).trim()
  )
    return fail();
  return {
    cause: v.cause as PracticeSupportReason,
    explanation: v.explanation as string,
    nextAction: v.nextAction as string,
    question: v.question as string,
  };
}
