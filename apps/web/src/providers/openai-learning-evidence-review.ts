import 'server-only';
import {
  validatePersonalLearningEvidenceReview,
  type PersonalLearningEvidenceReview,
  type PersonalLearningEvidenceKind,
  type AiModelCapability,
} from '@bunshin/application';
import { serializeOpenAiTaskRequest } from '../ai/openai-task-compatibility';
import { generateLearningStructured } from './openai-learning-lesson';
import type { PersonalLearningOfferPolicy } from '@bunshin/capability-training';
import { personalLearningOfferPromptPolicy } from './personal-learning-offer-policy';

export const LEARNING_EVIDENCE_REVIEW_PROMPT_VERSION = 'learning-evidence-review-v1';

interface LessonMaterial {
  originalWish: string;
  outcome: string;
  criteria: string[];
}

interface ProviderReview {
  matched: {
    criterionIndex: number;
    state: 'SEEN_IN_TEXT' | 'NOT_SHOWN' | 'UNCLEAR';
    evidence: string;
  }[];
  feedback: string;
  nextAction: string;
}

function validateProviderReview(
  value: unknown,
  material: LessonMaterial,
  kind: PersonalLearningEvidenceKind,
  content: string,
): PersonalLearningEvidenceReview {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid review');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 3 ||
    !Array.isArray(v.matched) ||
    v.matched.length > material.criteria.length ||
    typeof v.feedback !== 'string' ||
    !v.feedback.trim() ||
    v.feedback.length > 500 ||
    typeof v.nextAction !== 'string' ||
    !v.nextAction.trim() ||
    v.nextAction.length > 500
  )
    throw new Error('invalid review');
  const matched = v.matched as unknown as ProviderReview['matched'];
  const indices = new Set<number>();
  for (const item of matched) {
    if (
      !item ||
      typeof item !== 'object' ||
      !Number.isInteger(item.criterionIndex) ||
      item.criterionIndex < 0 ||
      item.criterionIndex >= material.criteria.length ||
      indices.has(item.criterionIndex) ||
      !['SEEN_IN_TEXT', 'NOT_SHOWN', 'UNCLEAR'].includes(item.state) ||
      typeof item.evidence !== 'string' ||
      item.evidence.length > 240
    )
      throw new Error('invalid review');
    indices.add(item.criterionIndex);
  }
  const seen =
    kind === 'TEXT'
      ? matched
          .filter(
            (item) =>
              item.state === 'SEEN_IN_TEXT' &&
              item.evidence.trim().length > 0 &&
              content.includes(item.evidence),
          )
          .map((item) => material.criteria[item.criterionIndex]!)
      : [];
  const notEstablished =
    kind === 'SELF_REPORT'
      ? ['本人の報告として記録。提出物による確認はしていません。', ...material.criteria]
      : material.criteria.filter((_, index) => !seen.includes(material.criteria[index]!));
  const review: PersonalLearningEvidenceReview = {
    state:
      kind === 'SELF_REPORT'
        ? 'SELF_REPORT_ONLY'
        : seen.length === material.criteria.length
          ? 'CURRENT_STEP_EVIDENCE'
          : 'FOLLOW_UP',
    observed: seen,
    notEstablished: notEstablished.slice(0, 8),
    feedback: v.feedback,
    nextAction: v.nextAction,
  };
  if (!validatePersonalLearningEvidenceReview(review)) throw new Error('invalid review');
  return review;
}

export function learningEvidenceReviewBody(input: {
  material: LessonMaterial;
  kind: PersonalLearningEvidenceKind;
  content: string;
  model: string;
  maxRequestBytes: number;
  maxOutputTokens: number;
  offerPolicy?: PersonalLearningOfferPolicy;
}) {
  const body = serializeOpenAiTaskRequest('TRAINING_ASSESSMENT', {
    model: input.model,
    store: false,
    max_output_tokens: input.maxOutputTokens,
    input: [
      {
        role: 'system',
        content: personalLearningOfferPromptPolicy(input.offerPolicy).evidenceReviewInstructions,
      },
      {
        role: 'user',
        content: JSON.stringify({
          ...input.material,
          evidenceKind: input.kind,
          submission: input.content,
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'personal_learning_evidence_review',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            matched: {
              type: 'array',
              maxItems: input.material.criteria.length,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  criterionIndex: {
                    type: 'integer',
                    minimum: 0,
                    maximum: Math.max(0, input.material.criteria.length - 1),
                  },
                  state: { type: 'string', enum: ['SEEN_IN_TEXT', 'NOT_SHOWN', 'UNCLEAR'] },
                  evidence: { type: 'string' },
                },
                required: ['criterionIndex', 'state', 'evidence'],
              },
            },
            feedback: { type: 'string' },
            nextAction: { type: 'string' },
          },
          required: ['matched', 'feedback', 'nextAction'],
        },
      },
    },
  });
  if (Buffer.byteLength(body, 'utf8') > input.maxRequestBytes)
    throw new Error('evidence review request limit exceeded');
  return body;
}

export function generateLearningEvidenceReview(options: {
  apiKey: string;
  model: string;
  body: string;
  material: LessonMaterial;
  kind: PersonalLearningEvidenceKind;
  content: string;
  provider?: 'openai' | 'google';
  modelCapabilities: readonly AiModelCapability[];
  fetch?: typeof fetch;
}) {
  return generateLearningStructured<PersonalLearningEvidenceReview>({
    ...options,
    validate: (value) =>
      validateProviderReview(value, options.material, options.kind, options.content),
  });
}
