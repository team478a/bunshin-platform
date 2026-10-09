import { describe, expect, it } from 'vitest';
import {
  REPRODUCTION_CHALLENGE_REVIEW_VERSION,
  REPRODUCTION_CHALLENGE_REVIEW_CHECKS,
  REPRODUCTION_CHALLENGE_REVIEW_FIXTURES,
  defineReproductionChallengeReviewRecord,
  serializeReproductionChallengeReviewMaterial,
  compareReproductionChallengeReviewBinding,
  resolveReproductionChallengeReference,
} from '../src/index';

// Synthetic assertions only, not real human approval.
const reference = REPRODUCTION_CHALLENGE_REVIEW_FIXTURES[0]!.reference;
const material = serializeReproductionChallengeReviewMaterial(reference)!;
async function digest(text: string): Promise<`sha256:${string}`> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
const materialDigest = await digest(material);
const expected = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  serviceId: '00000000-0000-0000-0000-000000000002',
  reviewerUserId: '00000000-0000-0000-0000-000000000003',
  reviewedCommitSha: 'a'.repeat(40),
  materialDigest,
};
const record = {
  contractVersion: REPRODUCTION_CHALLENGE_REVIEW_VERSION,
  reviewId: '00000000-0000-0000-0000-000000000004',
  ...expected,
  reviewedAt: '2026-10-09T06:00:00.000Z',
  evidenceKey: 'synthetic-test-review-1',
  reference,
  decision: 'APPROVE',
  checklist: Object.fromEntries(REPRODUCTION_CHALLENGE_REVIEW_CHECKS.map((key) => [key, true])),
};
describe('challenge review assertions never grant execution approval', () => {
  it.each(['APPROVE', 'REJECT', 'REVISION_REQUIRED'])(
    'represents %s without approval',
    (decision) => {
      const input = { ...record, decision };
      expect(defineReproductionChallengeReviewRecord(input).decision).toBe(decision);
      expect(compareReproductionChallengeReviewBinding(input, expected)).toEqual({
        status: 'MATCHED',
        reason: 'REVIEW_BINDING_MATCHED',
        executionPermission: 'NOT_GRANTED',
      });
      expect(resolveReproductionChallengeReference(reference)).toEqual({
        status: 'UNKNOWN',
        reason: 'HUMAN_REVIEW_REQUIRED',
      });
    },
  );
  it.each(REPRODUCTION_CHALLENGE_REVIEW_CHECKS)('requires %s for APPROVE', (key) => {
    const input = { ...record, checklist: { ...record.checklist, [key]: false } };
    expect(() => defineReproductionChallengeReviewRecord(input)).toThrow();
    expect(
      defineReproductionChallengeReviewRecord({ ...input, decision: 'REVISION_REQUIRED' })
        .checklist[key],
    ).toBe(false);
  });
  it.each(['approved', 'scenario', 'answer', 'providerResponse', 'humanVerified', 'authority'])(
    'rejects extra %s',
    (key) =>
      expect(() => defineReproductionChallengeReviewRecord({ ...record, [key]: true })).toThrow(),
  );
  it.each([
    { contractVersion: 'UNKNOWN' },
    { decision: 'APPROVED' },
    { reviewerUserId: 'client-user' },
    { reviewedCommitSha: 'main' },
    { materialDigest: 'sha256:secret' },
    { evidenceKey: 'free text body' },
    { reviewedAt: '2026-02-30T00:00:00.000Z' },
    { reviewedAt: 'not-a-date' },
    { checklist: {} },
    { checklist: { ...record.checklist, extra: true } },
    { checklist: { ...record.checklist, safety: 'true' } },
  ])('rejects malformed assertion %#', (change) => {
    expect(() => defineReproductionChallengeReviewRecord({ ...record, ...change })).toThrow();
  });
  it.each([
    'workspaceId',
    'serviceId',
    'reviewerUserId',
    'reviewedCommitSha',
    'materialDigest',
  ] as const)('rejects changed expected %s', (key) => {
    expect(
      compareReproductionChallengeReviewBinding(record, { ...expected, [key]: 'changed' }),
    ).toEqual({
      status: 'UNKNOWN',
      reason: 'REVIEW_BINDING_MISMATCH',
      executionPermission: 'NOT_GRANTED',
    });
  });
  it.each(['subjectVersion', 'challengeVersion', 'contractVersion'])(
    'keeps unknown %s UNKNOWN',
    (key) => {
      const unknown = { ...reference, [key]: 'UNKNOWN_VERSION' };
      expect(serializeReproductionChallengeReviewMaterial(unknown)).toBeNull();
      expect(
        compareReproductionChallengeReviewBinding({ ...record, reference: unknown }, expected)
          .reason,
      ).toBe('CHALLENGE_REFERENCE_UNKNOWN');
    },
  );
  it('rejects reference payload and missing fields', () => {
    expect(() =>
      defineReproductionChallengeReviewRecord({
        ...record,
        reference: { ...reference, approved: true },
      }),
    ).toThrow();
    const missing: Record<string, unknown> = { ...record };
    delete missing.reviewedAt;
    expect(() => defineReproductionChallengeReviewRecord(missing)).toThrow();
  });
  it('detaches immutable output', () => {
    const input = {
      ...record,
      checklist: { ...record.checklist },
      reference: { ...reference, definition: { ...reference.definition } },
    };
    const result = defineReproductionChallengeReviewRecord(input);
    input.checklist.safety = false;
    input.reference.definition.version = 'CHANGED';
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checklist)).toBe(true);
    expect(result.checklist.safety).toBe(true);
    expect(result.reference.definition.version).toBe(reference.definition.version);
  });
  it.each(REPRODUCTION_CHALLENGE_REVIEW_FIXTURES)(
    'pins material $reference.challengeKey',
    async (fixture) => {
      const text = serializeReproductionChallengeReviewMaterial(fixture.reference)!;
      const parsed = JSON.parse(text);
      expect(parsed.fixture).toEqual(fixture);
      expect(parsed.definition.reference).toEqual(fixture.reference.definition);
      expect(parsed.definition).toHaveProperty('evaluationRubricRef');
      expect(parsed.definition).toHaveProperty('prerequisites');
      expect(text).toBe(serializeReproductionChallengeReviewMaterial({ ...fixture.reference }));
      expect(fixture.reviewStatus).toBe('DRAFT');
      if (fixture !== REPRODUCTION_CHALLENGE_REVIEW_FIXTURES[0]) {
        expect(await digest(text)).not.toBe(materialDigest);
      }
    },
  );
});
