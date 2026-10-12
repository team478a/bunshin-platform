import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningActor } from './personal-learning-persistence';
import type { SavedLearningLessonCandidate } from './personal-learning-lesson-candidate';
import type { SavedPersonalLearningRequest } from './personal-learning-request';
import type { PracticeSupportState } from './personal-learning-practice-support';

export const PERSONAL_LEARNING_PRACTICE_VERSION = 'PERSONAL_LEARNING_PRACTICE_V1';
export const PERSONAL_LEARNING_PRACTICE_MISSION = 'PERSONAL_LEARNING_DYNAMIC_PRACTICE';
export interface PersonalLearningPractice {
  assignmentId: string;
  goalId: string;
  planId: string;
  planRevision: 1;
  startedAt: string;
  candidate: SavedLearningLessonCandidate;
  environment: Pick<
    SavedPersonalLearningRequest,
    'deviceType' | 'toolDescription' | 'experienceDescription' | 'currentPosition'
  >;
  note: { revision: number; text: string; reportedAt: string; evidenceLevel: 'SELF_REPORT' } | null;
  support: PracticeSupportState;
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
  }): Promise<PersonalLearningPractice>;
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
