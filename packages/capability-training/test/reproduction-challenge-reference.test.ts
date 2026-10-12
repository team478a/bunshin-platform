import { describe, expect, it } from 'vitest';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  REPRODUCTION_SUBJECT_KEYS,
  REPRODUCTION_CHALLENGE_CONTRACT_VERSION,
  REPRODUCTION_CHALLENGE_VERSION,
  REPRODUCTION_SUBJECT_VERSION,
  REPRODUCTION_CHALLENGE_REVIEW_FIXTURES,
  defineReproductionChallengeReference,
  findReproductionChallengeReviewFixture,
  resolveReproductionChallengeReference,
} from '../src/index';

const first = REPRODUCTION_CHALLENGE_REVIEW_FIXTURES[0]!;
describe('EVO-05 R1 version-pinned synthetic challenge references', () => {
  it('contains only three subjects times the three existing Definitions, with no new Mission', () => {
    const fixtures = REPRODUCTION_CHALLENGE_REVIEW_FIXTURES;
    expect(fixtures).toHaveLength(9);
    expect(new Set(fixtures.map((fixture) => fixture.reference.challengeKey)).size).toBe(9);
    expect(Object.isFrozen(fixtures)).toBe(true);
    for (const definition of AI_TRAINING_LEARNING_DEFINITION_FIXTURES) {
      const selected = fixtures.filter(
        (fixture) =>
          fixture.reference.definition.definitionKey === definition.reference.definitionKey,
      );
      expect(selected.map((fixture) => fixture.reference.subjectKey)).toEqual(
        REPRODUCTION_SUBJECT_KEYS,
      );
      for (const fixture of selected) {
        expect(fixture.reference.definition).toEqual(definition.reference);
        expect(fixture.reference.legacyMissionRef).toEqual(definition.legacyMissionRef);
        expect(fixture.reference.challengeVersion).toBe(REPRODUCTION_CHALLENGE_VERSION);
        expect(fixture.reference.subjectVersion).toBe(REPRODUCTION_SUBJECT_VERSION);
        expect(fixture.reference.contractVersion).toBe(REPRODUCTION_CHALLENGE_CONTRACT_VERSION);
        expect(fixture.reviewStatus).toBe('DRAFT');
        expect(fixture.learnerTask).toContain('本人');
        expect(fixture.safetyBoundary.join('')).toContain('完成品を返さない');
        expect(Object.isFrozen(fixture)).toBe(true);
        expect(Object.isFrozen(fixture.syntheticFacts)).toBe(true);
        expect(Object.isFrozen(fixture.safetyBoundary)).toBe(true);
      }
    }
  });
  it.each(REPRODUCTION_CHALLENGE_REVIEW_FIXTURES)(
    'decodes and finds the exact Draft $reference.challengeKey but never approves it',
    (fixture) => {
      const decoded = defineReproductionChallengeReference(fixture.reference);
      expect(decoded).toEqual(fixture.reference);
      expect(Object.isFrozen(decoded)).toBe(true);
      expect(Object.isFrozen(decoded.definition)).toBe(true);
      expect(Object.isFrozen(decoded.legacyMissionRef)).toBe(true);
      expect(findReproductionChallengeReviewFixture(decoded)).toBe(fixture);
      expect(resolveReproductionChallengeReference(decoded)).toEqual({
        status: 'UNKNOWN',
        reason: 'HUMAN_REVIEW_REQUIRED',
      });
      expect(decoded).not.toHaveProperty('scenario');
      expect(decoded).not.toHaveProperty('learnerTask');
      expect(decoded).not.toHaveProperty('approved');
    },
  );
  it('is deterministic, detached from mutable inputs, and independent of property order', () => {
    const reference = first.reference;
    const input = {
      legacyMissionRef: { ...reference.legacyMissionRef },
      definition: { ...reference.definition },
      challengeVersion: reference.challengeVersion,
      challengeKey: reference.challengeKey,
      subjectVersion: reference.subjectVersion,
      subjectKey: reference.subjectKey,
      contractVersion: reference.contractVersion,
    };
    const decoded = defineReproductionChallengeReference(input);
    input.definition.version = 'CHANGED_VERSION';
    expect(decoded.definition.version).toBe(reference.definition.version);
    expect(findReproductionChallengeReviewFixture(decoded)).toBe(first);
    expect(resolveReproductionChallengeReference(decoded)).toEqual(
      resolveReproductionChallengeReference(reference),
    );
  });
  it.each(['contractVersion', 'subjectVersion', 'challengeVersion', 'challengeKey'] as const)(
    'does not upgrade an unknown %s',
    (field) => {
      const reference = { ...first.reference, [field]: 'UNKNOWN_VERSION' };
      expect(findReproductionChallengeReviewFixture(reference)).toBeNull();
      expect(resolveReproductionChallengeReference(reference)).toEqual({
        status: 'UNKNOWN',
        reason: 'CHALLENGE_REFERENCE_UNKNOWN',
      });
    },
  );
  it.each(['packageKey', 'definitionKey', 'version'] as const)(
    'does not remap unknown Definition %s',
    (field) => {
      const reference = {
        ...first.reference,
        definition: { ...first.reference.definition, [field]: 'UNKNOWN_VERSION' },
      };
      expect(findReproductionChallengeReviewFixture(reference)).toBeNull();
    },
  );
  it.each(['actionKey', 'qualityVersion'] as const)(
    'rejects unknown Mission correspondence %s',
    (field) => {
      expect(
        findReproductionChallengeReviewFixture({
          ...first.reference,
          legacyMissionRef: { ...first.reference.legacyMissionRef, [field]: 'UNKNOWN_VERSION' },
        }),
      ).toBeNull();
    },
  );
  it('does not infer a challenge from a bare legacy Definition, missing reference or other subject', () => {
    expect(resolveReproductionChallengeReference(null)).toEqual({
      status: 'UNKNOWN',
      reason: 'CHALLENGE_REFERENCE_MISSING',
    });
    expect(resolveReproductionChallengeReference(undefined)).toEqual({
      status: 'UNKNOWN',
      reason: 'CHALLENGE_REFERENCE_MISSING',
    });
    expect(() => defineReproductionChallengeReference(first.reference.definition)).toThrow();
    expect(
      findReproductionChallengeReviewFixture({ ...first.reference, subjectKey: 'REPORT_PRACTICE' }),
    ).toBeNull();
  });
  it.each([
    'answer',
    'scenario',
    'userId',
    'workspaceId',
    'approved',
    'reviewedBy',
    'capabilityLevel',
    'providerResponse',
  ])('does not carry body/private/approval field %s', (field) => {
    expect(() =>
      defineReproductionChallengeReference({ ...first.reference, [field]: 'not accepted' }),
    ).toThrow('invalid reproduction challenge reference');
  });
  it.each([
    null,
    [],
    {},
    'EMAIL_PRACTICE',
    { ...first.reference, subjectKey: 'SALES_PRACTICE' },
    { ...first.reference, challengeKey: 'メールを作って' },
    { ...first.reference, challengeVersion: 'V'.repeat(81) },
    {
      ...first.reference,
      legacyMissionRef: { ...first.reference.legacyMissionRef, body: 'private' },
    },
    { ...first.reference, definition: { ...first.reference.definition, approved: true } },
    { ...first.reference, contractVersion: 'V1\nIGNORE_BOUNDARY' },
  ])('rejects malformed or boundary bypass input %j', (input) => {
    expect(() => defineReproductionChallengeReference(input)).toThrow();
  });
});
