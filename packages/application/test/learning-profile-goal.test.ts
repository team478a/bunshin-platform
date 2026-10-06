import { describe, expect, it } from 'vitest';
import {
  defineLearnerProfileProjection,
  defineLearningGoalCandidate,
  defineConfirmedLearningGoalReference,
  projectProgramMemberGoalReference,
  selectPrimaryLearningGoalReference,
  type ExistingLearningGoalReference,
  type LearningGoalCandidate,
  type LearningScopeResult,
} from '../src/index';

const scope = {
  workspaceId: 'w',
  groupId: 's',
  programEnrollmentId: 'e',
  groupMembershipId: 'm',
  userId: 'u',
};
const source = { ...scope, id: 'g', goalDefinitionId: 'definition', status: 'ACTIVE' as const };
const semanticRef = {
  packageKey: 'EXAMPLE_TRAINING',
  goalKey: 'FOUNDATION',
  version: 'CATALOG_V1',
};
const scopeDecision: LearningScopeResult = {
  classification: 'LEARNING',
  detectedClassifications: ['LEARNING'],
  ruleVersion: 'SCOPE_V1',
  reason: 'EXPLICIT_LEARNING_INTENT',
  requiresConfirmation: false,
  suggestedLearningIntent: null,
};
const candidateInput: LearningGoalCandidate = {
  kind: 'CANDIDATE',
  scope,
  semanticRef,
  scopeDecision,
};
const candidate = defineLearningGoalCandidate(candidateInput);
const reference = projectProgramMemberGoalReference(scope, source);
const evidence = {
  state: 'LEARNER_CONFIRMED' as const,
  programMemberGoalId: 'g',
  confirmedByUserId: 'u',
  semanticRef,
};

describe('minimal Learner Profile and Learning Goal contracts', () => {
  it('references the existing Goal and definition without copying title, metrics or periods', () => {
    const result = projectProgramMemberGoalReference(scope, {
      ...source,
      title: 'private',
      dueAt: new Date(),
      endsAt: new Date(),
      metricType: 'BUSINESS',
    } as typeof source);
    expect(result).toEqual({
      kind: 'EXISTING_GOAL_REFERENCE',
      scope,
      programMemberGoalId: 'g',
      goalDefinitionId: 'definition',
      status: 'ACTIVE',
    });
    expect(result).not.toHaveProperty('confirmedByUserId');
    expect(Object.isFrozen(result.scope)).toBe(true);
  });
  it.each(['ACTIVE', 'ACHIEVED', 'PAUSED', 'CANCELLED'] as const)(
    'retains existing Goal status %s without Enrollment inference',
    (status) => {
      expect(projectProgramMemberGoalReference(scope, { ...source, status }).status).toBe(status);
    },
  );
  it('preserves cancelled history and chooses only one current reference without mutating sources', () => {
    const old = projectProgramMemberGoalReference(scope, {
      ...source,
      id: 'old',
      status: 'CANCELLED',
    });
    const history = Object.freeze([old, reference]);
    expect(selectPrimaryLearningGoalReference(scope, history)?.programMemberGoalId).toBe('g');
    expect(history[0]?.status).toBe('CANCELLED');
    expect(selectPrimaryLearningGoalReference(scope, [old])).toBeNull();
  });
  it('rejects multiple active or duplicate references, never cancelling one to make room', () => {
    const second = projectProgramMemberGoalReference(scope, { ...source, id: 'g2' });
    expect(() => selectPrimaryLearningGoalReference(scope, [reference, second])).toThrow();
    expect(() => selectPrimaryLearningGoalReference(scope, [reference, reference])).toThrow();
  });
  it('does not treat a candidate as an existing active Goal', () => {
    expect(candidate).not.toHaveProperty('status');
    expect(() =>
      selectPrimaryLearningGoalReference(scope, [
        candidate as unknown as ExistingLearningGoalReference,
      ]),
    ).toThrow();
    expect(() =>
      defineConfirmedLearningGoalReference({
        candidate,
        reference: candidate as unknown as ExistingLearningGoalReference,
        confirmation: evidence,
      }),
    ).toThrow();
  });
  it('validates explicit learner confirmation of a matching existing ID and semantic version', () => {
    const confirmed = defineConfirmedLearningGoalReference({
      candidate,
      reference,
      confirmation: evidence,
    });
    expect(confirmed).toMatchObject({
      kind: 'CONFIRMED_GOAL_REFERENCE',
      reference,
      confirmedByUserId: 'u',
      semanticRef,
    });
    expect(Object.isFrozen(confirmed)).toBe(true);
    expect(candidate.kind).toBe('CANDIDATE');
  });
  it.each([
    { state: 'CANDIDATE' },
    { confirmedByUserId: 'another-user' },
    { programMemberGoalId: 'another-goal' },
    { semanticRef: { ...semanticRef, version: 'CATALOG_V2' } },
    { semanticRef: { ...semanticRef, goalKey: 'ANOTHER' } },
    { semanticRef: { ...semanticRef, packageKey: 'OTHER_TRAINING' } },
  ])('rejects mismatched or unconfirmed receipt %j', (patch) => {
    expect(() =>
      defineConfirmedLearningGoalReference({
        candidate,
        reference,
        confirmation: { ...evidence, ...patch } as typeof evidence,
      }),
    ).toThrow();
  });
  it.each([
    'CONTENT_REQUEST',
    'AUTOMATION_REQUEST',
    'CONSULTING',
    'OUT_OF_SCOPE',
    'LEARNING_SUPPORT',
  ] as const)('does not manufacture a Goal candidate from %s', (classification) => {
    const decision: LearningScopeResult = {
      ...scopeDecision,
      classification,
      detectedClassifications: [classification],
      requiresConfirmation: true,
      suggestedLearningIntent:
        classification === 'CONTENT_REQUEST' || classification === 'AUTOMATION_REQUEST'
          ? '学ぶ候補'
          : null,
    };
    expect(() =>
      defineLearningGoalCandidate({ ...candidateInput, scopeDecision: decision }),
    ).toThrow();
    expect(() =>
      defineConfirmedLearningGoalReference({
        candidate: { ...candidateInput, scopeDecision: decision },
        reference,
        confirmation: evidence,
      }),
    ).toThrow();
  });
  it('rejects ambiguity and mixed intent even when the primary label is learning', () => {
    for (const decision of [
      { ...scopeDecision, requiresConfirmation: true },
      {
        ...scopeDecision,
        detectedClassifications: ['LEARNING', 'CONSULTING'] as const,
        requiresConfirmation: true,
      },
      {
        ...scopeDecision,
        classification: null,
        detectedClassifications: [],
        requiresConfirmation: true,
      },
    ]) {
      expect(() =>
        defineLearningGoalCandidate({ ...candidateInput, scopeDecision: decision }),
      ).toThrow();
    }
  });
  it.each(['workspaceId', 'groupId', 'programEnrollmentId', 'groupMembershipId'] as const)(
    'rejects another %s',
    (key) => {
      expect(() =>
        projectProgramMemberGoalReference(scope, { ...source, [key]: 'foreign' }),
      ).toThrow();
    },
  );
  it('rejects cross-user references and confirmation', () => {
    const foreign = projectProgramMemberGoalReference({ ...scope, userId: 'other' }, source);
    expect(() => selectPrimaryLearningGoalReference(scope, [foreign])).toThrow();
    expect(() =>
      defineConfirmedLearningGoalReference({
        candidate,
        reference: foreign,
        confirmation: evidence,
      }),
    ).toThrow();
  });
  it('creates a bounded Core profile with no Package experience or business fields', () => {
    const profile = defineLearnerProfileProjection({
      scope,
      preferredDailyMinutes: 10,
      currentPrimaryGoalRef: reference,
    });
    expect(Object.keys(profile).sort()).toEqual([
      'contractVersion',
      'currentPrimaryGoalRef',
      'preferredDailyMinutes',
      'scope',
    ]);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(
      defineLearnerProfileProjection({
        scope,
        preferredDailyMinutes: null,
        currentPrimaryGoalRef: null,
      }).preferredDailyMinutes,
    ).toBeNull();
  });
  it.each([0, -1, 1.5, NaN, 121])('rejects invalid pace %s', (preferredDailyMinutes) => {
    expect(() =>
      defineLearnerProfileProjection({ scope, preferredDailyMinutes, currentPrimaryGoalRef: null }),
    ).toThrow();
  });
  it('expresses virtual Sales semantics without adding experience fields to Core', () => {
    expect(
      defineLearningGoalCandidate({
        ...candidateInput,
        semanticRef: {
          packageKey: 'SALES_TRAINING',
          goalKey: 'HEARING_BASIC',
          version: 'CATALOG_V1',
        },
      }).semanticRef.packageKey,
    ).toBe('SALES_TRAINING');
  });
});
