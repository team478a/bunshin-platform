import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningActor } from './personal-learning-persistence';
import type { SavedLearningLessonCandidate } from './personal-learning-lesson-candidate';
import type { SavedPersonalLearningRequest } from './personal-learning-request';
import type { PracticeSupportState } from './personal-learning-practice-support';

export const PERSONAL_LEARNING_PRACTICE_VERSION = 'PERSONAL_LEARNING_PRACTICE_V1';
export const PERSONAL_LEARNING_PRACTICE_MISSION = 'PERSONAL_LEARNING_DYNAMIC_PRACTICE';
export const PERSONAL_LEARNING_EVIDENCE_SUBMISSION_VERSION = 'PERSONAL_LEARNING_EVIDENCE_V1';
export type PersonalLearningEvidenceKind = 'TEXT' | 'SELF_REPORT';
export type PersonalLearningEvidenceReviewState =
  'CURRENT_STEP_EVIDENCE' | 'FOLLOW_UP' | 'SELF_REPORT_ONLY' | 'UNABLE_TO_ASSESS';
export interface PersonalLearningEvidenceReview {
  state: PersonalLearningEvidenceReviewState;
  observed: string[];
  notEstablished: string[];
  feedback: string;
  nextAction: string;
}
export interface PersonalLearningPracticeSubmission {
  answerId: string;
  revision: number;
  kind: PersonalLearningEvidenceKind;
  content: string;
  status: 'PENDING' | 'READY' | 'FAILED';
  review: PersonalLearningEvidenceReview | null;
  createdAt: string;
}
export interface StoredPersonalLearningEvidenceSubmission {
  schemaVersion: typeof PERSONAL_LEARNING_EVIDENCE_SUBMISSION_VERSION;
  kind: PersonalLearningEvidenceKind;
  content: string;
  candidateId: string;
  materialVersion: number;
  revision: number;
}
export interface PersonalLearningPractice {
  assignmentId: string;
  goalId: string;
  planId: string;
  planRevision: number;
  startedAt: string;
  candidate: SavedLearningLessonCandidate;
  environment: Pick<
    SavedPersonalLearningRequest,
    'deviceType' | 'toolDescription' | 'experienceDescription' | 'currentPosition'
  >;
  note: { revision: number; text: string; reportedAt: string; evidenceLevel: 'SELF_REPORT' } | null;
  support: PracticeSupportState;
  submissions: PersonalLearningPracticeSubmission[];
  nextCandidate: SavedLearningLessonCandidate | null;
}

export function validatePersonalLearningEvidenceSubmission(input: {
  kind: PersonalLearningEvidenceKind;
  content: string;
  expectedRevision: number;
}): void {
  if (
    !['TEXT', 'SELF_REPORT'].includes(input.kind) ||
    typeof input.content !== 'string' ||
    input.content !== input.content.trim() ||
    !input.content ||
    input.content.length > 10_000 ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= 100
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid practice evidence');
}

export function validatePersonalLearningEvidenceReview(
  value: unknown,
): value is PersonalLearningEvidenceReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const strings = (input: unknown) =>
    Array.isArray(input) &&
    input.length <= 8 &&
    input.every((s) => typeof s === 'string' && s.length <= 240);
  return (
    ['CURRENT_STEP_EVIDENCE', 'FOLLOW_UP', 'SELF_REPORT_ONLY', 'UNABLE_TO_ASSESS'].includes(
      String(v.state),
    ) &&
    strings(v.observed) &&
    strings(v.notEstablished) &&
    typeof v.feedback === 'string' &&
    v.feedback.trim().length > 0 &&
    v.feedback.length <= 500 &&
    typeof v.nextAction === 'string' &&
    v.nextAction.length <= 500 &&
    (!['UNABLE_TO_ASSESS', 'SELF_REPORT_ONLY'].includes(String(v.state)) ||
      v.nextAction.trim().length > 0)
  );
}

export function parseStoredPersonalLearningEvidenceSubmission(
  value: string,
): StoredPersonalLearningEvidenceSubmission | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const v = parsed as Record<string, unknown>;
    if (
      Object.keys(v).length !== 6 ||
      v.schemaVersion !== PERSONAL_LEARNING_EVIDENCE_SUBMISSION_VERSION ||
      !['TEXT', 'SELF_REPORT'].includes(String(v.kind)) ||
      typeof v.content !== 'string' ||
      typeof v.candidateId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(v.candidateId) ||
      v.materialVersion !== 1 ||
      !Number.isSafeInteger(v.revision) ||
      Number(v.revision) < 1 ||
      Number(v.revision) > 100
    )
      return null;
    validatePersonalLearningEvidenceSubmission({
      kind: v.kind as PersonalLearningEvidenceKind,
      content: v.content,
      expectedRevision: Number(v.revision) - 1,
    });
    return v as unknown as StoredPersonalLearningEvidenceSubmission;
  } catch {
    return null;
  }
}
export interface PersonalLearningPracticeState {
  allowed: boolean;
  current: PersonalLearningPractice | null;
}
export interface PersonalLearningPracticeRepository {
  readPractice(actor: PersonalLearningActor): Promise<PersonalLearningPracticeState>;
  startPractice(input: {
    actor: PersonalLearningActor;
    requestId: string;
    requestRevision: number;
    candidateId: string;
    previousAssignmentId?: string;
  }): Promise<PersonalLearningPractice>;
  createNextPracticeRequest(input: {
    actor: PersonalLearningActor;
    assignmentId: string;
    operationId: string;
  }): Promise<SavedPersonalLearningRequest>;
  recordPracticeNote(input: {
    actor: PersonalLearningActor;
    assignmentId: string;
    operationId: string;
    expectedRevision: number;
    text: string;
  }): Promise<PersonalLearningPractice>;
}
export function validatePersonalLearningPracticeNote(text: string, revision: number): void {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text !== text.trim() ||
    text.length > 500 ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision >= 1000
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid practice note');
}
