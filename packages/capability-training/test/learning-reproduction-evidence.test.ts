import { describe, expect, it } from 'vitest';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  AI_TRAINING_SKILL_RULE_VERSION,
  compareLearningReproduction,
  definePracticeCompletion,
  LEARNING_REPRODUCTION_RULE_VERSION,
  type LearningReproductionAttempt,
  type PracticeSupportLevel,
} from '../src/index';

const scope = {
  workspaceId: 'workspace',
  groupId: 'group',
  programEnrollmentId: 'enrollment',
  groupMembershipId: 'membership',
  userId: 'user',
};
function practice(
  followUp: boolean,
  supportLevel: PracticeSupportLevel = 'GUIDED',
): LearningReproductionAttempt {
  const assignmentId = followUp ? 'assignment-b' : 'assignment-a';
  return {
    scope: { ...scope },
    reference: {
      goalId: 'goal',
      planId: 'plan',
      planRevision: 1,
      definition: AI_TRAINING_LEARNING_DEFINITION_FIXTURES[0]!.reference,
      assignmentId,
    },
    subjectKey: followUp ? 'REPORT_PRACTICE' : 'EMAIL_PRACTICE',
    completedAt: followUp ? '2026-10-09T02:00:00.000Z' : '2026-10-09T01:00:00.000Z',
    completion: definePracticeCompletion({
      command: { action: 'COMPLETE', learnerConfirmedCompletion: true, usefulResult: true },
      started: true,
      assessmentVerified: true,
      interactions: ['SELF_PROMPTED', 'SELF_EVALUATED', 'SELF_REVISED'],
      supportLevel,
    }),
    assessment: {
      scope: { ...scope },
      assignmentId,
      answerId: followUp ? 'answer-b' : 'answer-a',
      evaluatedAt: followUp ? '2026-10-09T01:50:00.000Z' : '2026-10-09T00:50:00.000Z',
      ruleVersion: AI_TRAINING_SKILL_RULE_VERSION,
      verified: true,
      result: 'PASS',
    },
  };
}
const compare = (patch: Partial<LearningReproductionAttempt> = {}) =>
  compareLearningReproduction({
    baseline: practice(false),
    followUp: { ...practice(true), ...patch },
  });

describe('EVO-05-A bounded learner reproduction evidence', () => {
  it.each(AI_TRAINING_LEARNING_DEFINITION_FIXTURES)(
    'supports the existing Definition $reference.definitionKey only',
    (fixture) => {
      const baseline = practice(false);
      const followUp = practice(true, 'INDEPENDENT');
      const result = compareLearningReproduction({
        baseline: {
          ...baseline,
          reference: { ...baseline.reference, definition: fixture.reference },
        },
        followUp: {
          ...followUp,
          reference: { ...followUp.reference, definition: fixture.reference },
        },
      });
      expect(result).toMatchObject({
        status: 'EVIDENCE_AVAILABLE',
        ruleVersion: LEARNING_REPRODUCTION_RULE_VERSION,
        supportComparison: 'LESS_SUPPORT_RECORDED',
        evidenceBasis: 'LEARNER_REPORT_AND_PROMPT_ASSESSMENT',
        capabilityLevel: 'UNKNOWN',
        outcomeQuality: 'UNKNOWN',
        externalInteractionVerified: 'UNKNOWN',
        transferVerified: 'UNKNOWN',
      });
      expect(result).not.toHaveProperty('firstSuccess');
      expect(result).not.toHaveProperty('goalAchieved');
    },
  );
  it.each(['GUIDED', 'HINTED', 'INDEPENDENT'] as const)(
    'does not call reported support %s independent mastery',
    (level) => {
      const result = compareLearningReproduction({
        baseline: practice(false, 'HINTED'),
        followUp: practice(true, level),
      });
      expect(result.capabilityLevel).toBe('UNKNOWN');
      expect(result.supportComparison).toBe(
        level === 'GUIDED'
          ? 'MORE_SUPPORT_RECORDED'
          : level === 'HINTED'
            ? 'SAME_SUPPORT_RECORDED'
            : 'LESS_SUPPORT_RECORDED',
      );
    },
  );
  it.each([
    { completion: null },
    { completedAt: null },
    { assessment: null },
    { assessment: { ...practice(true).assessment!, verified: false } },
  ])('missing evidence stays UNKNOWN %j', (patch) => {
    expect(compare(patch).status).toBe('UNKNOWN');
  });
  it.each(['REVIEW', 'WAIT', 'RECOVERY'] as const)('does not promote %s to PASS', (result) => {
    expect(compare({ assessment: { ...practice(true).assessment!, result } }).reason).toBe(
      'ASSESSMENT_NOT_COMPLETION_EVIDENCE',
    );
  });
  it('also requires baseline completion and verified assessment', () => {
    for (const patch of [
      { completion: null },
      { assessment: null },
      { assessment: { ...practice(false).assessment!, verified: false } },
    ]) {
      expect(
        compareLearningReproduction({
          baseline: { ...practice(false), ...patch },
          followUp: practice(true),
        }).status,
      ).toBe('UNKNOWN');
    }
  });
  it.each([
    'workspaceId',
    'groupId',
    'programEnrollmentId',
    'groupMembershipId',
    'userId',
  ] as const)('rejects cross %s, including assessment ownership', (key) => {
    const followUp = practice(true);
    expect(() =>
      compare({
        scope: { ...scope, [key]: 'other' },
        assessment: { ...followUp.assessment!, scope: { ...scope, [key]: 'other' } },
      }),
    ).toThrow();
    expect(() =>
      compare({ assessment: { ...followUp.assessment!, scope: { ...scope, [key]: 'other' } } }),
    ).toThrow();
  });
  it.each(['goalId', 'planId', 'planRevision', 'definition'] as const)(
    'does not compare changed %s',
    (key) => {
      const ref = practice(true).reference;
      const changed =
        key === 'planRevision'
          ? 2
          : key === 'definition'
            ? { ...ref.definition, version: 'UNKNOWN_V2' }
            : 'other';
      expect(compare({ reference: { ...ref, [key]: changed } }).reason).toBe(
        'LEARNING_REFERENCE_CHANGED',
      );
    },
  );
  it('rejects unknown Definitions even if both refer to the same version', () => {
    const baseline = practice(false);
    const followUp = practice(true);
    const definition = { ...baseline.reference.definition, version: 'UNKNOWN_V2' };
    expect(
      compareLearningReproduction({
        baseline: { ...baseline, reference: { ...baseline.reference, definition } },
        followUp: { ...followUp, reference: { ...followUp.reference, definition } },
      }).reason,
    ).toBe('DEFINITION_VERSION_UNKNOWN');
  });
  it('does not count replay, same subject or same Answer as a new reproduction', () => {
    expect(compare({ subjectKey: 'EMAIL_PRACTICE' }).reason).toBe('DISTINCT_PRACTICE_REQUIRED');
    const followUp = practice(true);
    expect(
      compare({
        reference: { ...followUp.reference, assignmentId: 'assignment-a' },
        assessment: { ...followUp.assessment!, assignmentId: 'assignment-a' },
      }).reason,
    ).toBe('DISTINCT_PRACTICE_REQUIRED');
    expect(compare({ assessment: { ...followUp.assessment!, answerId: 'answer-a' } }).reason).toBe(
      'DISTINCT_ANSWER_REQUIRED',
    );
  });
  it('requires a later practice and later matching Assessment', () => {
    expect(compare({ completedAt: practice(false).completedAt }).reason).toBe(
      'LATER_PRACTICE_REQUIRED',
    );
    expect(
      compare({
        assessment: { ...practice(true).assessment!, evaluatedAt: '2026-10-09T00:50:00.000Z' },
      }).reason,
    ).toBe('LATER_ASSESSMENT_REQUIRED');
    expect(
      compare({
        assessment: { ...practice(true).assessment!, evaluatedAt: '2026-10-09T03:00:00.000Z' },
      }).status,
    ).toBe('UNKNOWN');
    expect(
      compare({ assessment: { ...practice(true).assessment!, ruleVersion: 'UNKNOWN_V2' } }).reason,
    ).toBe('ASSESSMENT_RULE_VERSION_UNKNOWN');
    expect(() =>
      compare({ assessment: { ...practice(true).assessment!, assignmentId: 'other' } }),
    ).toThrow();
  });
  it('is deterministic, deeply immutable and does not mutate supplied sources', () => {
    const input = { baseline: practice(false), followUp: practice(true) };
    const before = JSON.stringify(input);
    const result = compareLearningReproduction(input);
    expect(compareLearningReproduction(input)).toEqual(result);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result.followUp.reference.definition)).toBe(true);
    expect(Object.isFrozen(result.followUp.assessment?.scope)).toBe(true);
    expect(Object.isFrozen(result.followUp.completion?.capabilityEvidence)).toBe(true);
  });
  it.each([
    { ...practice(true), outcome: 'confidential finished document' },
    { ...practice(true), subjectKey: 'private customer name' },
    { ...practice(true), completedAt: '2026-02-30T00:00:00.000Z' },
    { ...practice(true), reference: { ...practice(true).reference, planRevision: 0 } },
    {
      ...practice(true),
      reference: {
        ...practice(true).reference,
        definition: { ...practice(true).reference.definition, content: 'body' },
      },
    },
    { ...practice(true), completion: { ...practice(true).completion!, capabilityLevel: 4 } },
    {
      ...practice(true),
      completion: { ...practice(true).completion!, learnerConfirmation: 'UNKNOWN' },
    },
    {
      ...practice(true),
      completion: {
        ...practice(true).completion!,
        capabilityEvidence: ['GUIDED_COMPLETION', 'SELF_PROMPTED'],
      },
    },
    { ...practice(true), completion: { ...practice(true).completion!, response: 'provider text' } },
    { ...practice(true), assessment: { ...practice(true).assessment!, prompt: 'secret prompt' } },
  ])('rejects raw text or malformed contracts %j', (followUp) => {
    expect(() =>
      compareLearningReproduction({
        baseline: practice(false),
        followUp: followUp as LearningReproductionAttempt,
      }),
    ).toThrow();
  });
});
