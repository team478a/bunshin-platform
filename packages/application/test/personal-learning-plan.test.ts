import { describe, expect, it } from 'vitest';
import {
  definePersonalLearningPlan,
  definePersonalLearningPlanRevision,
  defineLearningDefinitionReference,
  defineLearningGoalCandidate,
  defineConfirmedLearningGoalReference,
  projectProgramMemberGoalReference,
  PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
  type PersonalLearningPlan,
  type LearningScopeResult,
} from '../src/index';

const scope = {
  workspaceId: 'w',
  groupId: 's',
  programEnrollmentId: 'e',
  groupMembershipId: 'm',
  userId: 'u',
};
const semanticRef = { packageKey: 'EXAMPLE_TRAINING', goalKey: 'FOUNDATION', version: 'GOAL_V1' };
const scopeDecision: LearningScopeResult = {
  classification: 'LEARNING',
  detectedClassifications: ['LEARNING'],
  ruleVersion: 'SCOPE_V1',
  reason: 'EXPLICIT_LEARNING_INTENT',
  requiresConfirmation: false,
  suggestedLearningIntent: null,
};
const candidate = defineLearningGoalCandidate({
  kind: 'CANDIDATE',
  scope,
  semanticRef,
  scopeDecision,
});
const reference = projectProgramMemberGoalReference(scope, {
  ...scope,
  id: 'g',
  goalDefinitionId: null,
  status: 'ACTIVE',
});
const goal = defineConfirmedLearningGoalReference({
  candidate,
  reference,
  confirmation: {
    state: 'LEARNER_CONFIRMED',
    programMemberGoalId: 'g',
    confirmedByUserId: 'u',
    semanticRef,
  },
});
const definition = defineLearningDefinitionReference({
  packageKey: 'EXAMPLE_TRAINING',
  definitionKey: 'FOUNDATION',
  version: 'DEFINITION_V1',
});
const advanced = defineLearningDefinitionReference({ ...definition, definitionKey: 'PRACTICE' });
const draft: PersonalLearningPlan = {
  contractVersion: PERSONAL_LEARNING_PLAN_CONTRACT_VERSION,
  ruleVersion: 'PLAN_RULE_V1',
  planId: 'plan',
  revision: 1,
  previousRevision: null,
  revisionReason: 'INITIAL',
  scope,
  goal,
  status: 'DRAFT',
  confirmation: null,
  steps: [
    { definition, prerequisites: [], selectionReason: 'GOAL_ALIGNMENT' },
    { definition: advanced, prerequisites: [definition], selectionReason: 'PREREQUISITE_REQUIRED' },
  ],
};
const confirmed: PersonalLearningPlan = {
  ...draft,
  status: 'CONFIRMED',
  confirmation: { planId: 'plan', revision: 1, confirmedByUserId: 'u' },
};
const parse = (patch: object) => definePersonalLearningPlan({ ...draft, ...patch });

describe('Personal Learning Plan minimum contract', () => {
  it('pins Definition identity/version and separates draft from learner-confirmed Plan', () => {
    expect(definePersonalLearningPlan(draft)).toMatchObject({
      status: 'DRAFT',
      confirmation: null,
    });
    expect(definePersonalLearningPlan(confirmed)).toMatchObject({
      status: 'CONFIRMED',
      confirmation: { revision: 1 },
      steps: [{ definition }, { definition: advanced, prerequisites: [definition] }],
    });
    expect(Object.isFrozen(definePersonalLearningPlan(confirmed).steps[1]?.prerequisites)).toBe(
      true,
    );
  });
  it.each([
    candidate,
    reference,
    scopeDecision,
    { ...scopeDecision, classification: 'CONTENT_REQUEST', suggestedLearningIntent: '学ぶ候補' },
  ])('rejects unconfirmed Goal / Scope / Suggestion %j', (unconfirmed) => {
    expect(() =>
      parse({ goal: unconfirmed, status: 'CONFIRMED', confirmation: confirmed.confirmation }),
    ).toThrow();
  });
  it.each([
    { goal: { ...goal, kind: 'CANDIDATE' } },
    { goal: { ...goal, confirmedByUserId: 'other' } },
    { goal: { ...goal, semanticRef: { packageKey: 'EXAMPLE_TRAINING' } } },
    { goal: { ...goal, reference: { ...reference, kind: 'CANDIDATE' } } },
    { goal: { ...goal, reference: { ...reference, status: 'CANCELLED' } } },
  ])('rejects malformed or inapplicable confirmed Goal %j', (patch) => {
    expect(() => parse(patch)).toThrow();
  });
  it.each([
    'workspaceId',
    'groupId',
    'programEnrollmentId',
    'groupMembershipId',
    'userId',
  ] as const)('rejects a different %s', (field) => {
    expect(() => parse({ scope: { ...scope, [field]: 'other' } })).toThrow();
  });
  it.each([
    { status: 'CONFIRMED', confirmation: null },
    { confirmation: confirmed.confirmation },
    { status: 'CONFIRMED', confirmation: { ...confirmed.confirmation, revision: 2 } },
    { status: 'CONFIRMED', confirmation: { ...confirmed.confirmation, planId: 'other' } },
    {
      status: 'CONFIRMED',
      confirmation: { ...confirmed.confirmation, confirmedByUserId: 'other' },
    },
    { status: 'ACTIVE' },
  ])('requires a separate same-revision Plan confirmation %j', (patch) => {
    expect(() => parse(patch)).toThrow();
  });
  it('represents a new Draft revision without overwriting or auto-confirming its predecessor', () => {
    const previous = definePersonalLearningPlan(confirmed);
    const next = definePersonalLearningPlanRevision(previous, {
      ...draft,
      revision: 2,
      previousRevision: { planId: 'plan', revision: 1 },
      revisionReason: 'REVIEW_REQUIRED',
    });
    expect(next).toMatchObject({
      revision: 2,
      status: 'DRAFT',
      confirmation: null,
      previousRevision: { revision: 1 },
    });
    expect(previous).toMatchObject({ revision: 1, status: 'CONFIRMED' });
    expect(next).not.toBe(previous);
  });
  it.each([
    { revision: 0 },
    { revision: 1.5 },
    { revision: 2, previousRevision: null },
    {
      revision: 2,
      previousRevision: { planId: 'other', revision: 1 },
      revisionReason: 'REVIEW_REQUIRED',
    },
    {
      revision: 3,
      previousRevision: { planId: 'plan', revision: 1 },
      revisionReason: 'REVIEW_REQUIRED',
    },
    { revisionReason: 'REVIEW_REQUIRED' },
    { ruleVersion: '' },
    { contractVersion: 'V2' },
  ])('rejects inconsistent revision metadata %j', (patch) => {
    expect(() => parse(patch)).toThrow();
  });
  it('does not carry approval into a new revision', () => {
    expect(() =>
      definePersonalLearningPlan({
        ...confirmed,
        revision: 2,
        previousRevision: { planId: 'plan', revision: 1 },
        revisionReason: 'REVIEW_REQUIRED',
      }),
    ).toThrow();
    expect(() =>
      definePersonalLearningPlanRevision(confirmed, {
        ...confirmed,
        revision: 2,
        previousRevision: { planId: 'plan', revision: 1 },
        revisionReason: 'REVIEW_REQUIRED',
        confirmation: { planId: 'plan', revision: 2, confirmedByUserId: 'u' },
      }),
    ).toThrow();
  });
  it('ties GOAL_CHANGED to a real change of Goal reference or semantic version', () => {
    const next = {
      ...draft,
      revision: 2,
      previousRevision: { planId: 'plan', revision: 1 },
      revisionReason: 'GOAL_CHANGED' as const,
    };
    expect(() => definePersonalLearningPlanRevision(confirmed, next)).toThrow();
    const changed = {
      ...next,
      goal: { ...goal, semanticRef: { ...semanticRef, version: 'GOAL_V2' } },
    };
    expect(definePersonalLearningPlanRevision(confirmed, changed).revisionReason).toBe(
      'GOAL_CHANGED',
    );
    expect(() =>
      definePersonalLearningPlanRevision(confirmed, {
        ...changed,
        revisionReason: 'REVIEW_REQUIRED',
      }),
    ).toThrow();
  });
  it('retains declared external prerequisites without treating them as mastered', () => {
    const plan = parse({
      steps: [
        {
          definition: advanced,
          prerequisites: [definition],
          selectionReason: 'SKILL_ALREADY_MASTERED',
        },
      ],
    });
    expect(plan.steps[0]?.prerequisites).toEqual([definition]);
    expect(plan.steps[0]).not.toHaveProperty('prerequisitePassed');
  });
  it.each(
    [
      [],
      [{ definition, prerequisites: [definition], selectionReason: 'GOAL_ALIGNMENT' }],
      [
        { definition: advanced, prerequisites: [definition], selectionReason: 'GOAL_ALIGNMENT' },
        draft.steps[0],
      ],
      [draft.steps[0], draft.steps[0]],
      [
        {
          definition: { ...definition, packageKey: 'OTHER' },
          prerequisites: [],
          selectionReason: 'GOAL_ALIGNMENT',
        },
      ],
      [
        {
          definition,
          prerequisites: [{ ...advanced, packageKey: 'OTHER' }],
          selectionReason: 'GOAL_ALIGNMENT',
        },
      ],
    ].map((steps) => ({ steps })),
  )('rejects empty, cyclic, misordered, duplicate or cross-Package paths %j', ({ steps }) => {
    expect(() => parse({ steps })).toThrow();
  });
  it.each(['content', 'hint', 'personalizedExample', 'generatedAnswer', 'manual'])(
    'rejects generated %s in Plan',
    (field) => {
      expect(() => parse({ [field]: 'private generated text' })).toThrow();
      expect(() => parse({ steps: [{ ...draft.steps[0], [field]: 'private text' }] })).toThrow();
      expect(() => defineLearningDefinitionReference({ ...definition, [field]: 'text' })).toThrow();
    },
  );
  it('copies and freezes versioned references instead of retaining mutable input', () => {
    const mutableRef = { ...definition };
    const plan = parse({
      steps: [{ definition: mutableRef, prerequisites: [], selectionReason: 'GOAL_ALIGNMENT' }],
    });
    mutableRef.version = 'DEFINITION_V2';
    expect(plan.steps[0]?.definition.version).toBe('DEFINITION_V1');
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.steps[0])).toBe(true);
    expect(Object.isFrozen(plan.goal.semanticRef)).toBe(true);
    expect(() => defineLearningDefinitionReference({ ...definition, version: '' })).toThrow();
  });
  it('Plan COMPLETED does not end Enrollment or change the Goal lifecycle', () => {
    const completed = definePersonalLearningPlan({ ...confirmed, status: 'COMPLETED' });
    expect(completed.goal.reference.status).toBe('ACTIVE');
    expect(completed).not.toHaveProperty('endsAt');
    expect(completed).not.toHaveProperty('enrollmentStatus');
    expect(reference.status).toBe('ACTIVE');
  });
  it('represents virtual Sales without Core fields for AI or provider/content', () => {
    const salesGoal = {
      ...goal,
      semanticRef: { packageKey: 'SALES_TRAINING', goalKey: 'HEARING', version: 'GOAL_V1' },
    };
    const salesDefinition = {
      packageKey: 'SALES_TRAINING',
      definitionKey: 'HEARING_BASIC',
      version: 'DEFINITION_V1',
    };
    expect(
      parse({
        goal: salesGoal,
        steps: [
          { definition: salesDefinition, prerequisites: [], selectionReason: 'GOAL_ALIGNMENT' },
        ],
      }).steps[0]?.definition,
    ).toEqual(salesDefinition);
  });
});
