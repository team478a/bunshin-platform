import {
  defineLearningDefinitionReference,
  type LearningDefinitionReference,
} from '@bunshin/application';
import { REPRODUCTION_SUBJECT_KEYS } from './learning-reproduction-evidence';

export const REPRODUCTION_CHALLENGE_CONTRACT_VERSION = 'AI_TRAINING_REPRODUCTION_CHALLENGE_REF_V1';
export const REPRODUCTION_SUBJECT_VERSION = 'AI_TRAINING_REPRODUCTION_SUBJECT_V1';
export const REPRODUCTION_CHALLENGE_VERSION = 'AI_TRAINING_REPRODUCTION_CHALLENGE_DRAFT_V1';

/** Reference only. Neither Human Approval nor learner authorization is carried in this contract. */
export interface ReproductionChallengeReference {
  readonly contractVersion: string;
  readonly subjectKey: (typeof REPRODUCTION_SUBJECT_KEYS)[number];
  readonly subjectVersion: string;
  readonly challengeKey: string;
  readonly challengeVersion: string;
  readonly definition: LearningDefinitionReference;
  readonly legacyMissionRef: {
    readonly actionKey: string;
    readonly qualityVersion: string;
  };
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key)))
    invalid();
  return object;
}
function invalid(): never {
  throw new Error('invalid reproduction challenge reference');
}
function key(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(value)) invalid();
  return value;
}

/** Strict structural decoding only: unknown versions are not upgraded to a current version. */
export function defineReproductionChallengeReference(
  input: unknown,
): ReproductionChallengeReference {
  const value = record(input, [
    'contractVersion',
    'subjectKey',
    'subjectVersion',
    'challengeKey',
    'challengeVersion',
    'definition',
    'legacyMissionRef',
  ]);
  const subjectKey = REPRODUCTION_SUBJECT_KEYS.find((subject) => subject === value['subjectKey']);
  if (!subjectKey) invalid();
  const definition = record(value['definition'], ['packageKey', 'definitionKey', 'version']);
  const mission = record(value['legacyMissionRef'], ['actionKey', 'qualityVersion']);
  return Object.freeze({
    contractVersion: key(value['contractVersion']),
    subjectKey,
    subjectVersion: key(value['subjectVersion']),
    challengeKey: key(value['challengeKey']),
    challengeVersion: key(value['challengeVersion']),
    definition: defineLearningDefinitionReference({
      packageKey: key(definition['packageKey']),
      definitionKey: key(definition['definitionKey']),
      version: key(definition['version']),
    }),
    legacyMissionRef: Object.freeze({
      actionKey: key(mission['actionKey']),
      qualityVersion: key(mission['qualityVersion']),
    }),
  });
}
