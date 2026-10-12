import { ApplicationError } from '@bunshin/shared';
import {
  validatePersonalLearningWrite,
  type PersonalLearningActor,
  type PersonalLearningWrite,
} from './personal-learning-persistence';

/** Learner-reported context, NOT confirmed ability, a Goal, or a lesson. */
export interface PersonalLearningRequestContent {
  readonly originalText: string;
  readonly deviceType: 'SMARTPHONE' | 'PC' | 'BOTH' | null;
  readonly toolDescription: string | null;
  readonly experienceDescription: string | null;
  readonly currentPosition: string | null;
}
export interface SavedPersonalLearningRequest extends PersonalLearningRequestContent {
  readonly id: string;
  readonly revision: number;
  readonly createdAt: string;
}
export type SavePersonalLearningRequest = PersonalLearningWrite & {
  readonly content: PersonalLearningRequestContent;
  readonly expectedRevision: number;
};
export interface PersonalLearningRequestRepository {
  readRequest(input: PersonalLearningActor): Promise<SavedPersonalLearningRequest | null>;
  saveRequest(input: SavePersonalLearningRequest): Promise<SavedPersonalLearningRequest>;
}
export function validateSavePersonalLearningRequest(input: SavePersonalLearningRequest): void {
  validatePersonalLearningWrite(input);
  const c = input.content;
  if (
    !c ||
    typeof c !== 'object' ||
    Object.keys(c).length !== 5 ||
    Object.keys(c).some(
      (key) =>
        ![
          'originalText',
          'deviceType',
          'toolDescription',
          'experienceDescription',
          'currentPosition',
        ].includes(key),
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid request content fields');
  const validText = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision > 2147483646 ||
    !validText(c.originalText, 2000) ||
    ![null, 'SMARTPHONE', 'PC', 'BOTH'].includes(c.deviceType) ||
    ![
      [c.toolDescription, 240],
      [c.experienceDescription, 300],
      [c.currentPosition, 500],
    ].every(([value, max]) => value === null || validText(value, max as number))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid learning request');
}
