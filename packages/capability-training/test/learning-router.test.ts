import { describe, expect, it } from 'vitest';
import type { PersonalLearningPlan } from '@bunshin/application';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES as definitions,
  AI_TRAINING_SKILL_RULE_VERSION,
  routeAiTrainingLearning,
  type AiTrainingDefinitionEvidence,
} from '../src/index';

const scope = {
  workspaceId: 'w',
  groupId: 'g',
  userId: 'u',
  groupMembershipId: 'm',
  programEnrollmentId: 'e',
};
const plan: PersonalLearningPlan = {
  contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
  ruleVersion: 'PERSONAL_LEARNING_PLAN_V1',
  planId: 'plan',
  revision: 1,
  previousRevision: null,
  revisionReason: 'INITIAL',
  scope,
  goal: {
    kind: 'CONFIRMED_GOAL_REFERENCE',
    confirmedByUserId: 'u',
    semanticRef: {
      packageKey: 'AI_TRAINING',
      goalKey: 'USE_AI_IN_DAILY_WORK',
      version: 'AI_TRAINING_CATALOG_V1',
    },
    reference: {
      kind: 'EXISTING_GOAL_REFERENCE',
      scope,
      programMemberGoalId: 'goal',
      goalDefinitionId: null,
      status: 'ACTIVE',
    },
  },
  steps: definitions.map((d) => ({
    definition: d.reference,
    prerequisites: d.prerequisites,
    selectionReason: 'GOAL_ALIGNMENT',
  })),
  status: 'CONFIRMED',
  confirmation: { planId: 'plan', revision: 1, confirmedByUserId: 'u' },
};
const pass = (index: number): AiTrainingDefinitionEvidence => ({
  definition: definitions[index]!.reference,
  planRevision: 1,
  assignmentId: `a${index}`,
  sequence: index + 1,
  missionKey: definitions[index]!.legacyMissionRef.actionKey,
  qualityVersion: definitions[index]!.legacyMissionRef.qualityVersion,
  assignmentStatus: 'COMPLETED',
  evaluatedAt: '2026-10-06T02:00:00Z',
  verifiedAssessment: true,
  evaluation: {
    result: 'PASS',
    understanding: 80,
    skills: { promptStructure: 80, contextSetting: 80, constraintSetting: 80 },
    evaluatedSkillKeys: ['promptStructure', 'contextSetting', 'constraintSetting'],
    evaluationRuleVersion: AI_TRAINING_SKILL_RULE_VERSION,
  },
});
const base = {
  plan,
  expectedRevision: 1,
  goalActive: true,
  enrollmentActive: true,
  approvedRefs: definitions.map((d) => d.reference),
  evidence: [] as AiTrainingDefinitionEvidence[],
};

describe('P1-E deterministic learning router', () => {
  it('A: selects first; B: requires independent evidence for the shared Mission', () => {
    expect(routeAiTrainingLearning(base)).toMatchObject({
      status: 'NEXT',
      definition: definitions[0]!.reference,
    });
    expect(routeAiTrainingLearning({ ...base, evidence: [pass(0)] })).toMatchObject({
      status: 'NEXT',
      definition: definitions[1]!.reference,
    });
  });
  it('C: never passes an unevaluated Assignment', () => {
    expect(
      routeAiTrainingLearning({ ...base, evidence: [{ ...pass(0), verifiedAssessment: false }] })
        .status,
    ).toBe('UNKNOWN');
  });
  it('D: distinguishes REVIEW and RETRY without scoring or evaluating', () => {
    for (const [understanding, status] of [
      [70, 'REVIEW'],
      [40, 'RETRY'],
    ] as const) {
      expect(
        routeAiTrainingLearning({
          ...base,
          evidence: [
            {
              ...pass(0),
              assignmentStatus: 'SKIPPED',
              evaluation: { ...(pass(0).evaluation as object), result: 'REVIEW', understanding },
            },
          ],
        }).status,
      ).toBe(status);
    }
  });
  it('E: missing prerequisite blocks a truncated path', () => {
    expect(
      routeAiTrainingLearning({ ...base, plan: { ...plan, steps: plan.steps.slice(1) } }).status,
    ).toBe('BLOCKED');
  });
  it('F: completion is a read-only result, not Goal or Enrollment completion', () => {
    const before = JSON.stringify(base);
    expect(routeAiTrainingLearning({ ...base, evidence: [pass(0), pass(1), pass(2)] }).status).toBe(
      'PLAN_COMPLETED',
    );
    expect(JSON.stringify(base)).toBe(before);
  });
  it('G: rejects revision drift and stale evidence', () => {
    expect(routeAiTrainingLearning({ ...base, expectedRevision: 2 }).reason).toBe(
      'PLAN_REVISION_CHANGED',
    );
    expect(
      routeAiTrainingLearning({ ...base, evidence: [{ ...pass(0), planRevision: 2 }] }).status,
    ).toBe('UNKNOWN');
  });
  it('H/I/J: approval, Goal and Enrollment are independent gates', () => {
    expect(routeAiTrainingLearning({ ...base, approvedRefs: [] }).reason).toBe(
      'DEFINITION_NOT_APPROVED',
    );
    expect(routeAiTrainingLearning({ ...base, goalActive: false }).reason).toBe('GOAL_NOT_ACTIVE');
    expect(routeAiTrainingLearning({ ...base, enrollmentActive: false }).reason).toBe(
      'ENROLLMENT_NOT_ACTIVE',
    );
  });
  it.each(['evaluationRuleVersion', 'evaluatedSkillKeys', 'skills'])(
    'requires versioned Skill evidence: %s',
    (key) => {
      const evaluation = { ...(pass(0).evaluation as Record<string, unknown>) };
      delete evaluation[key];
      expect(
        routeAiTrainingLearning({ ...base, evidence: [{ ...pass(0), evaluation }] }).status,
      ).toBe('UNKNOWN');
    },
  );
  it('rejects unknown versions, wrong Mission and draft Plans', () => {
    expect(
      routeAiTrainingLearning({ ...base, evidence: [{ ...pass(0), missionKey: 'OTHER' }] }).status,
    ).toBe('UNKNOWN');
    expect(
      routeAiTrainingLearning({ ...base, plan: { ...plan, status: 'DRAFT', confirmation: null } })
        .status,
    ).toBe('BLOCKED');
    expect(
      routeAiTrainingLearning({
        ...base,
        plan: {
          ...plan,
          steps: [
            { ...plan.steps[0]!, definition: { ...definitions[0]!.reference, version: 'OTHER' } },
          ],
        },
      }).status,
    ).toBe('UNKNOWN');
  });
});
