import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningActor } from './personal-learning-persistence';
import type { SavedPersonalLearningRequest } from './personal-learning-request';

export const LEARNING_CANDIDATE_POLICY = 'LEARNER_PRACTICE_TOOL_INDEPENDENT_V1';
export interface LearningLessonProposal {
  status: 'READY' | 'NEEDS_CONTEXT' | 'OUT_OF_SCOPE';
  reason: string;
  questions: string[];
  outcome: string;
  explanation: string;
  example: string;
  practice: string[];
  evidence: string[];
  criteria: string[];
}
export interface SavedLearningLessonCandidate {
  id: string;
  requestId: string;
  requestRevision: number;
  originalText: string;
  policyVersion: typeof LEARNING_CANDIDATE_POLICY;
  materialVersion: 1;
  promptVersion: string;
  usageKey: string;
  createdAt: string;
  confirmedAt: string | null;
  toolFeatureSources?: readonly {
    title: string;
    sourceTitle: string;
    sourceUrl: string;
  }[];
  proposal: LearningLessonProposal;
}
/** Format checks are NOT proof of educational quality, factual accuracy or learner ability. */
export function validateLearningLessonProposal(value: unknown): LearningLessonProposal {
  const fail = (): never => {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid lesson proposal');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  const keys = [
    'status',
    'reason',
    'questions',
    'outcome',
    'explanation',
    'example',
    'practice',
    'evidence',
    'criteria',
  ];
  if (Object.keys(v).length !== keys.length || keys.some((k) => !Object.hasOwn(v, k)))
    return fail();
  if (!['READY', 'NEEDS_CONTEXT', 'OUT_OF_SCOPE'].includes(String(v.status))) return fail();
  for (const key of ['reason', 'outcome', 'explanation', 'example']) {
    if (typeof v[key] !== 'string' || v[key].length > 1200) return fail();
  }
  for (const key of ['questions', 'practice', 'evidence', 'criteria']) {
    const items = v[key];
    if (
      !Array.isArray(items) ||
      items.length > 4 ||
      items.some((x) => typeof x !== 'string' || !x.trim() || x.length > 400)
    )
      return fail();
  }
  if (!(v.reason as string).trim()) return fail();
  if (
    v.status === 'READY' &&
    (!(v.outcome as string).trim() ||
      !(v.explanation as string).trim() ||
      !(v.example as string).trim() ||
      (v.questions as string[]).length ||
      ['practice', 'evidence', 'criteria'].some((k) => !(v[k] as string[]).length))
  )
    return fail();
  if (
    v.status !== 'READY' &&
    (['outcome', 'explanation', 'example'].some((k) => v[k] !== '') ||
      ['practice', 'evidence', 'criteria'].some((k) => (v[k] as string[]).length))
  )
    return fail();
  if (v.status === 'NEEDS_CONTEXT' && !(v.questions as string[]).length) return fail();
  if (v.status === 'OUT_OF_SCOPE' && (v.questions as string[]).length) return fail();
  return structuredClone(v) as unknown as LearningLessonProposal;
}
export interface LearningCandidateRepository {
  readCandidate(actor: PersonalLearningActor): Promise<SavedLearningLessonCandidate | null>;
  save(input: {
    actor: PersonalLearningActor;
    request: SavedPersonalLearningRequest;
    proposal: LearningLessonProposal;
    usageKey: string;
    promptVersion: string;
    toolFeatureSources?: SavedLearningLessonCandidate['toolFeatureSources'];
  }): Promise<SavedLearningLessonCandidate>;
  confirm(input: {
    actor: PersonalLearningActor;
    requestId: string;
    requestRevision: number;
    candidateId: string;
  }): Promise<SavedLearningLessonCandidate>;
}
