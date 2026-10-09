import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES } from './learning-definition-fixtures';
import { findReproductionChallengeReviewFixture } from './reproduction-challenge-fixtures';
import {
  defineReproductionChallengeReference,
  type ReproductionChallengeReference,
} from './reproduction-challenge-reference';

export const REPRODUCTION_CHALLENGE_REVIEW_VERSION = 'AI_TRAINING_CHALLENGE_REVIEW_V1';
export const REPRODUCTION_CHALLENGE_REVIEW_CHECKS = [
  'objective',
  'prerequisites',
  'syntheticFacts',
  'learnerTask',
  'rubricAndMission',
  'safety',
] as const;
export type ReproductionChallengeReviewDecision = 'APPROVE' | 'REJECT' | 'REVISION_REQUIRED';

/** A review assertion, NOT verified human approval, authorization, or a Runtime input. */
export interface ReproductionChallengeReviewRecord {
  readonly contractVersion: typeof REPRODUCTION_CHALLENGE_REVIEW_VERSION;
  readonly reviewId: string;
  readonly workspaceId: string;
  readonly serviceId: string;
  readonly reviewerUserId: string;
  readonly reviewedAt: string;
  readonly reviewedCommitSha: string;
  readonly materialDigest: `sha256:${string}`;
  readonly evidenceKey: string;
  readonly reference: ReproductionChallengeReference;
  readonly decision: ReproductionChallengeReviewDecision;
  readonly checklist: Readonly<
    Record<(typeof REPRODUCTION_CHALLENGE_REVIEW_CHECKS)[number], boolean>
  >;
}

const keys = [
  'contractVersion',
  'reviewId',
  'workspaceId',
  'serviceId',
  'reviewerUserId',
  'reviewedAt',
  'reviewedCommitSha',
  'materialDigest',
  'evidenceKey',
  'reference',
  'decision',
  'checklist',
] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function object(input: unknown, expected: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
  return value;
}
function invalid(): never {
  throw new Error('invalid reproduction challenge review record');
}
function string(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) invalid();
  return value;
}

/** Strict immutable projection. Callers must not treat successful decoding as approval. */
export function defineReproductionChallengeReviewRecord(
  input: unknown,
): ReproductionChallengeReviewRecord {
  const value = object(input, keys);
  if (value.contractVersion !== REPRODUCTION_CHALLENGE_REVIEW_VERSION) invalid();
  if (!['APPROVE', 'REJECT', 'REVISION_REQUIRED'].includes(value.decision as string)) invalid();
  const decision = value.decision as ReproductionChallengeReviewDecision;
  const checks = object(value.checklist, REPRODUCTION_CHALLENGE_REVIEW_CHECKS);
  const checklist = {} as Record<(typeof REPRODUCTION_CHALLENGE_REVIEW_CHECKS)[number], boolean>;
  for (const key of REPRODUCTION_CHALLENGE_REVIEW_CHECKS) {
    if (typeof checks[key] !== 'boolean' || (decision === 'APPROVE' && checks[key] !== true))
      invalid();
    checklist[key] = checks[key];
  }
  const reviewedAt = string(value.reviewedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  if (!Number.isFinite(Date.parse(reviewedAt)) || new Date(reviewedAt).toISOString() !== reviewedAt)
    invalid();
  return Object.freeze({
    contractVersion: REPRODUCTION_CHALLENGE_REVIEW_VERSION,
    reviewId: string(value.reviewId, uuid),
    workspaceId: string(value.workspaceId, uuid),
    serviceId: string(value.serviceId, uuid),
    reviewerUserId: string(value.reviewerUserId, uuid),
    reviewedAt,
    reviewedCommitSha: string(value.reviewedCommitSha, /^[a-f0-9]{40}$/),
    materialDigest: string(value.materialDigest, /^sha256:[a-f0-9]{64}$/) as `sha256:${string}`,
    evidenceKey: string(value.evidenceKey, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/),
    reference: defineReproductionChallengeReference(value.reference),
    decision,
    checklist: Object.freeze(checklist),
  });
}

/** Deterministic synthetic review material, including the full corresponding Definition.
 * Future trusted server computes SHA-256 over UTF-8 of this exact string; no caller digest is trusted.
 * This is review-only: it must not be served as approved teaching/Assignment content.
 */
export function serializeReproductionChallengeReviewMaterial(input: unknown): string | null {
  const fixture = findReproductionChallengeReviewFixture(input);
  if (!fixture) return null;
  const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
    (item) => JSON.stringify(item.reference) === JSON.stringify(fixture.reference.definition),
  );
  if (!definition) return null;
  return JSON.stringify({
    contractVersion: REPRODUCTION_CHALLENGE_REVIEW_VERSION,
    fixture,
    definition,
  });
}

/** Binding comparison only. Expected values must come from authenticated server context
 * and a server-computed digest at the pinned commit. MATCHED still grants NO execution permission.
 * Authentication, review persistence/history, revocation and digest computation are not implemented here.
 */
export function compareReproductionChallengeReviewBinding(
  input: unknown,
  expected: {
    readonly workspaceId: string;
    readonly serviceId: string;
    readonly reviewerUserId: string;
    readonly reviewedCommitSha: string;
    readonly materialDigest: `sha256:${string}`;
  },
) {
  const record = defineReproductionChallengeReviewRecord(input);
  const known = serializeReproductionChallengeReviewMaterial(record.reference) !== null;
  const matches =
    known &&
    record.workspaceId === expected.workspaceId &&
    record.serviceId === expected.serviceId &&
    record.reviewerUserId === expected.reviewerUserId &&
    record.reviewedCommitSha === expected.reviewedCommitSha &&
    record.materialDigest === expected.materialDigest;
  return Object.freeze({
    status: matches ? ('MATCHED' as const) : ('UNKNOWN' as const),
    reason: !known
      ? ('CHALLENGE_REFERENCE_UNKNOWN' as const)
      : matches
        ? ('REVIEW_BINDING_MATCHED' as const)
        : ('REVIEW_BINDING_MISMATCH' as const),
    executionPermission: 'NOT_GRANTED' as const,
  });
}
