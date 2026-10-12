import { describe, expect, it } from 'vitest';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  AI_TRAINING_SKILL_RULE_VERSION,
  GUIDED_PRACTICE_RULE_VERSION,
  REPRODUCTION_CHALLENGE_REVIEW_FIXTURES,
  REPRODUCTION_HISTORY_MAX_EVENTS,
  definePracticeCompletion,
  projectLearningReproductionHistory,
  type ReproductionHistorySnapshot,
} from '../src/index';

function fixture(definitionIndex = 0): ReproductionHistorySnapshot {
  const scope = {
    workspaceId: 'workspace',
    groupId: 'group',
    programEnrollmentId: 'enrollment',
    groupMembershipId: 'membership',
    userId: 'user',
  };
  const scoped = {
    workspaceId: scope.workspaceId,
    groupId: scope.groupId,
    programEnrollmentId: scope.programEnrollmentId,
  };
  const definition = AI_TRAINING_LEARNING_DEFINITION_FIXTURES[definitionIndex]!;
  const snapshot: ReproductionHistorySnapshot = {
    scope,
    baselineAssignmentId: 'baseline',
    followUpAssignmentId: 'follow',
    assignments: [],
    answers: [],
    events: [],
    plans: [
      {
        scope,
        planId: 'plan',
        revision: 1,
        goalId: 'goal',
        contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
        ruleVersion: 'PERSONAL_LEARNING_PLAN_V1',
        status: 'CONFIRMED',
        confirmedAt: '2026-10-01T00:00:00.000Z',
        steps: [{ definition: definition.reference }],
      },
    ],
    truncated: false,
  };
  for (const [index, assignmentId] of ['baseline', 'follow'].entries()) {
    const day = index + 2;
    const time = (minute: number) =>
      `2026-10-0${day}T00:${String(minute).padStart(2, '0')}:00.000Z`;
    const reference = {
      goalId: 'goal',
      planId: 'plan',
      planRevision: 1,
      definition: definition.reference,
      assignmentId,
    };
    const common = {
      ...reference,
      ruleVersion: GUIDED_PRACTICE_RULE_VERSION,
      operator: 'LEARNER',
      provenance: 'LEARNER_REPORTED',
    };
    const answerId = `answer-${assignmentId}`;
    const evaluation = {
      result: 'PASS',
      understanding: 80,
      evaluationRuleVersion: AI_TRAINING_SKILL_RULE_VERSION,
      evaluatedSkillKeys: definition.targetSkillRefs.map((ref) => ref.skillKey),
      skills: Object.fromEntries(definition.targetSkillRefs.map((ref) => [ref.skillKey, 80])),
    };
    const completion = definePracticeCompletion({
      command: { action: 'COMPLETE', learnerConfirmedCompletion: true, usefulResult: true },
      started: true,
      interactions: ['SELF_PROMPTED', 'SELF_EVALUATED'],
      assessmentVerified: true,
      supportLevel: 'INDEPENDENT',
    });
    (snapshot.assignments as unknown[]).push({
      ...scoped,
      id: assignmentId,
      status: 'COMPLETED',
      targetResourceType: 'PERSONAL_LEARNING_PLAN',
      targetResourceId: 'plan',
      missionDefinitionKey: definition.legacyMissionRef.actionKey,
      presentedAt: time(0),
      completedAt: time(4),
      displaySnapshot: {
        qualityVersion: definition.legacyMissionRef.qualityVersion,
        personalLearning: {
          planId: 'plan',
          planRevision: 1,
          definition: definition.reference,
          challenge: REPRODUCTION_CHALLENGE_REVIEW_FIXTURES[definitionIndex * 3 + index]!.reference,
        },
      },
    });
    (snapshot.answers as unknown[]).push({
      ...scoped,
      id: answerId,
      userId: scope.userId,
      missionAssignmentId: assignmentId,
      evaluationStatus: 'READY',
      evaluatedAt: time(4),
      evaluation,
    });
    const event = (
      suffix: string,
      minute: number,
      eventType: string,
      metadata: unknown,
      sourceResourceType = 'PERSONAL_LEARNING_PLAN',
      sourceResourceId = 'plan',
    ) => ({
      ...scoped,
      id: `${assignmentId}-${suffix}`,
      actorUserId: scope.userId,
      missionAssignmentId: assignmentId,
      eventType,
      schemaVersion: 1,
      sourceResourceType,
      sourceResourceId,
      occurredAt: time(minute),
      metadata,
    });
    (snapshot.events as unknown[]).push(
      event('start', 1, 'PERSONAL_LEARNING_PRACTICE_STARTED', {
        ...common,
        supportLevel: 'INDEPENDENT',
        command: { action: 'START', supportLevel: 'INDEPENDENT' },
      }),
      event('prompt', 2, 'PERSONAL_LEARNING_CAPABILITY_INTERACTION', {
        ...common,
        interaction: 'SELF_PROMPTED',
        command: { action: 'INTERACT', interaction: 'SELF_PROMPTED' },
      }),
      event('evaluate', 3, 'PERSONAL_LEARNING_CAPABILITY_INTERACTION', {
        ...common,
        interaction: 'SELF_EVALUATED',
        command: { action: 'INTERACT', interaction: 'SELF_EVALUATED' },
      }),
      event(
        'audit',
        4,
        'ANSWER_EVALUATED',
        structuredClone(evaluation),
        'TRAINING_MISSION_ANSWER',
        answerId,
      ),
      event(
        'complete',
        5,
        'PERSONAL_LEARNING_PRACTICE_COMPLETED',
        {
          ...common,
          ...completion,
          command: { action: 'COMPLETE', learnerConfirmedCompletion: true, usefulResult: true },
          assessment: { answerId, ruleVersion: AI_TRAINING_SKILL_RULE_VERSION },
        },
        'TRAINING_MISSION_ANSWER',
        answerId,
      ),
    );
  }
  return structuredClone(snapshot);
}
// Mutations model corrupt, deleted, redacted or stale persisted records, not client acceptance.
type Mutable = ReturnType<typeof fixture>;
function metadata(snapshot: Mutable, id: string) {
  return snapshot.events.find((row) => row.id === id)!.metadata as Record<string, unknown>;
}
function personal(snapshot: Mutable) {
  return (snapshot.assignments[0]!.displaySnapshot as { personalLearning: Record<string, unknown> })
    .personalLearning;
}
const result = (snapshot: Mutable) => projectLearningReproductionHistory(snapshot);

describe('EVO-05 R2 read-only history projection', () => {
  it.each([0, 1, 2])(
    'validates existing Definition %s with its own target Skill, but never approves Drafts',
    (index) => {
      expect(result(fixture(index)).reason).toBe('HUMAN_REVIEW_REQUIRED');
    },
  );
  it('does not confuse shared PROMPT_BASIC Mission with CONTEXT_SETTING completion', () => {
    const s = fixture(1);
    (s.answers[0]!.evaluation as Record<string, unknown>).evaluatedSkillKeys = ['promptStructure'];
    (s.answers[0]!.evaluation as Record<string, unknown>).skills = { promptStructure: 100 };
    metadata(s, 'baseline-audit').evaluatedSkillKeys = ['promptStructure'];
    metadata(s, 'baseline-audit').skills = { promptStructure: 100 };
    expect(result(s).reason).toBe('ASSESSMENT_SKILL_EVIDENCE_MISSING');
  });
  it('rechecks matching synthetic evidence but keeps unreviewed drafts UNKNOWN', () => {
    const snapshot = fixture(),
      before = structuredClone(snapshot);
    expect(result(snapshot)).toMatchObject({
      status: 'UNKNOWN',
      reason: 'HUMAN_REVIEW_REQUIRED',
      capabilityLevel: 'UNKNOWN',
      transferVerified: 'UNKNOWN',
      supportComparison: 'UNKNOWN',
    });
    expect(snapshot).toEqual(before);
    expect(Object.isFrozen(result(snapshot))).toBe(true);
    expect(result(snapshot)).toEqual(result(snapshot));
  });
  it('returns only bounded reasons/limitations, never raw history or bodies', () => {
    const snapshot = fixture();
    metadata(snapshot, 'baseline-start').privateText = 'DO_NOT_EXPOSE';
    const output = JSON.stringify(result(snapshot));
    expect(output).not.toContain('DO_NOT_EXPOSE');
    for (const key of [
      'baseline',
      'followUp',
      'assignments',
      'answers',
      'events',
      'metadata',
      'evaluation',
    ])
      expect(result(snapshot)).not.toHaveProperty(key);
  });
  it.each([
    [
      'legacy missing subject',
      (s: Mutable) => {
        delete personal(s).challenge;
      },
      'CHALLENGE_REFERENCE_MISSING',
    ],
    [
      'unknown version',
      (s: Mutable) => {
        (personal(s).challenge as Record<string, unknown>).subjectVersion = 'UNKNOWN_VERSION';
      },
      'CHALLENGE_REFERENCE_UNKNOWN',
    ],
    [
      'body injection',
      (s: Mutable) => {
        (personal(s).challenge as Record<string, unknown>).body = 'private';
      },
      'CHALLENGE_REFERENCE_INVALID',
    ],
    [
      'missing answer after deletion',
      (s: Mutable) => {
        s.answers = s.answers.slice(1);
      },
      'ANSWER_MISSING',
    ],
    [
      'completion deleted',
      (s: Mutable) => {
        s.events = s.events.filter((row) => row.id !== 'baseline-complete');
      },
      'PRACTICE_EVENT_MISSING_OR_AMBIGUOUS',
    ],
    [
      'audit missing',
      (s: Mutable) => {
        s.events = s.events.filter((row) => row.id !== 'baseline-audit');
      },
      'ASSESSMENT_AUDIT_MISSING_OR_AMBIGUOUS',
    ],
    [
      'audit changed',
      (s: Mutable) => {
        metadata(s, 'baseline-audit').understanding = 99;
      },
      'ASSESSMENT_AUDIT_MISMATCH',
    ],
    [
      'fake PASS',
      (s: Mutable) => {
        (s.answers[0]!.evaluation as Record<string, unknown>).result = 'WAIT';
        metadata(s, 'baseline-audit').result = 'WAIT';
      },
      'ASSESSMENT_SKILL_EVIDENCE_MISSING',
    ],
    [
      'missing Skill',
      (s: Mutable) => {
        (s.answers[0]!.evaluation as Record<string, unknown>).skills = {};
        metadata(s, 'baseline-audit').skills = {};
      },
      'ASSESSMENT_SKILL_EVIDENCE_MISSING',
    ],
    [
      'missing interaction',
      (s: Mutable) => {
        s.events = s.events.filter((row) => row.id !== 'baseline-prompt');
      },
      'LEARNER_INTERACTION_MISSING',
    ],
    [
      'missing learner confirmation',
      (s: Mutable) => {
        metadata(s, 'baseline-complete').command = {
          action: 'COMPLETE',
          learnerConfirmedCompletion: false,
          usefulResult: true,
        };
      },
      'LEARNER_CONFIRMATION_MISSING',
    ],
    [
      'support understated',
      (s: Mutable) => {
        s.events = [...s.events, { ...s.events[0]!, id: 'hint', eventType: 'HINT_VIEWED' }];
      },
      'SUPPORT_EVIDENCE_MISMATCH',
    ],
    [
      'support after completion',
      (s: Mutable) => {
        s.events = [
          ...s.events,
          {
            ...s.events[0]!,
            id: 'help',
            eventType: 'HELP_REQUESTED',
            occurredAt: '2026-10-02T01:00:00.000Z',
          },
        ];
      },
      'SUPPORT_TIME_MISMATCH',
    ],
    [
      'Plan redacted',
      (s: Mutable) => {
        s.plans = [];
      },
      'PLAN_REVISION_MISSING',
    ],
    [
      'revision mismatch',
      (s: Mutable) => {
        personal(s).planRevision = 2;
      },
      'PLAN_REVISION_MISSING',
    ],
    [
      'snapshot redacted',
      (s: Mutable) => {
        s.assignments = s.assignments.map((row, i) =>
          i === 0 ? { ...row, displaySnapshot: {} } : row,
        );
      },
      'CHALLENGE_REFERENCE_MISSING',
    ],
    [
      'completion reference changed',
      (s: Mutable) => {
        metadata(s, 'baseline-complete').goalId = 'other';
      },
      'PRACTICE_REFERENCE_MISMATCH',
    ],
    [
      'audit wrong source',
      (s: Mutable) => {
        s.events = s.events.map((row) =>
          row.id === 'baseline-audit' ? { ...row, sourceResourceId: 'other-answer' } : row,
        );
      },
      'ASSESSMENT_AUDIT_MISSING_OR_AMBIGUOUS',
    ],
    [
      'incomplete Assignment',
      (s: Mutable) => {
        s.assignments = s.assignments.map((row, i) =>
          i === 0 ? { ...row, status: 'STARTED' } : row,
        );
      },
      'ASSIGNMENT_NOT_COMPLETED',
    ],
    [
      'truncation',
      (s: Mutable) => {
        s.truncated = true;
      },
      'HISTORY_TRUNCATED',
    ],
    [
      'same Assignment',
      (s: Mutable) => {
        s.followUpAssignmentId = s.baselineAssignmentId;
      },
      'DISTINCT_PRACTICE_REQUIRED',
    ],
    [
      'duplicate event',
      (s: Mutable) => {
        s.events = [...s.events, s.events[0]!];
      },
      'HISTORY_AMBIGUOUS',
    ],
  ] as const)('%s cannot produce reproduction success', (_, mutate, reason) => {
    const snapshot = fixture();
    mutate(snapshot);
    expect(result(snapshot)).toMatchObject({ status: 'UNKNOWN', reason });
  });
  it.each(['workspaceId', 'groupId', 'programEnrollmentId'] as const)(
    'rejects foreign Assignment %s',
    (field) => {
      const s = fixture();
      s.assignments = s.assignments.map((row, i) => (i === 0 ? { ...row, [field]: 'other' } : row));
      expect(result(s).reason).toBe('HISTORY_SCOPE_MISMATCH');
    },
  );
  it.each(['actorUserId', 'workspaceId', 'groupId', 'programEnrollmentId'] as const)(
    'rejects foreign event %s',
    (field) => {
      const s = fixture();
      s.events = s.events.map((row, i) => (i === 0 ? { ...row, [field]: 'other' } : row));
      expect(result(s).reason).toBe('HISTORY_SCOPE_MISMATCH');
    },
  );
  it('rejects stale evaluation time, invalid timestamps, and row overflow', () => {
    const s = fixture();
    s.answers = s.answers.map((row, i) =>
      i === 0 ? { ...row, evaluatedAt: '2026-10-02T01:00:00.000Z' } : row,
    );
    expect(result(s).reason).toBe('ASSESSMENT_TIME_MISMATCH');
    s.answers = s.answers.map((row, i) => (i === 0 ? { ...row, evaluatedAt: 'not-a-time' } : row));
    expect(result(s).reason).toBe('HISTORY_TIME_INVALID');
    s.events = Array.from({ length: REPRODUCTION_HISTORY_MAX_EVENTS + 1 }, () => s.events[0]!);
    expect(result(s).reason).toBe('HISTORY_TRUNCATED');
  });
  it.each(['userId', 'workspaceId', 'groupId', 'programEnrollmentId'] as const)(
    'rejects foreign Answer %s',
    (field) => {
      const s = fixture();
      s.answers = s.answers.map((row, i) => (i === 0 ? { ...row, [field]: 'other' } : row));
      expect(result(s).reason).toBe('HISTORY_SCOPE_MISMATCH');
    },
  );
  it.each([
    'userId',
    'groupMembershipId',
    'workspaceId',
    'groupId',
    'programEnrollmentId',
  ] as const)('rejects foreign Plan %s', (field) => {
    const s = fixture();
    s.plans = s.plans.map((row) => ({ ...row, scope: { ...row.scope, [field]: 'other' } }));
    expect(result(s).reason).toBe('HISTORY_SCOPE_MISMATCH');
  });
  it('does not accept metadata verified flags instead of real evidence', () => {
    const s = fixture();
    metadata(s, 'baseline-complete').verified = true;
    metadata(s, 'baseline-complete').result = 'PASS';
    s.answers = [];
    expect(result(s).reason).toBe('ANSWER_MISSING');
  });
  it('requires a genuinely later follow-up, not timestamps near one another', () => {
    const s = fixture();
    s.assignments = s.assignments.map((row) => ({
      ...row,
      presentedAt: row.presentedAt.replace('10-03', '10-02'),
      completedAt: row.completedAt?.replace('10-03', '10-02') ?? null,
    }));
    s.answers = s.answers.map((row) => ({
      ...row,
      evaluatedAt: row.evaluatedAt?.replace('10-03', '10-02') ?? null,
    }));
    s.events = s.events.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.replace('10-03', '10-02'),
    }));
    expect(result(s).reason).toBe('LATER_PRACTICE_REQUIRED');
  });
  it('does not reuse a stored success after either side is deleted or redacted', () => {
    const s = fixture();
    expect(result(s).reason).toBe('HUMAN_REVIEW_REQUIRED');
    s.answers = s.answers.slice(0, 1);
    expect(result(s).reason).toBe('ANSWER_MISSING');
    s.assignments = s.assignments.slice(0, 1);
    expect(result(s).reason).toBe('ASSIGNMENT_MISSING');
  });
  it('treats ambiguous revisions and missing Plan content as UNKNOWN without guessing', () => {
    const s = fixture();
    s.plans = [...s.plans, s.plans[0]!];
    expect(result(s).reason).toBe('HISTORY_AMBIGUOUS');
    s.plans = [{ ...s.plans[0]!, steps: [null] }];
    expect(result(s).reason).toBe('PLAN_ASSIGNMENT_MISMATCH');
  });
  it.each([0, 59, 101, NaN])(
    'rejects out-of-range target Skill score %s even when audit matches',
    (score) => {
      const s = fixture();
      (s.answers[0]!.evaluation as Record<string, unknown>).skills = { promptStructure: score };
      metadata(s, 'baseline-audit').skills = { promptStructure: score };
      expect(result(s).reason).toBe('ASSESSMENT_SKILL_EVIDENCE_MISSING');
    },
  );
  it('rejects an unknown assessment rule even when audit and completion claim success', () => {
    const s = fixture();
    (s.answers[0]!.evaluation as Record<string, unknown>).evaluationRuleVersion = 'UNKNOWN_RULE';
    metadata(s, 'baseline-audit').evaluationRuleVersion = 'UNKNOWN_RULE';
    expect(result(s).reason).toBe('ASSESSMENT_SKILL_EVIDENCE_MISSING');
  });
  it.each(['contractVersion', 'ruleVersion'] as const)(
    'does not upgrade unknown Plan %s',
    (field) => {
      const s = fixture();
      s.plans = s.plans.map((row) => ({ ...row, [field]: 'UNKNOWN_VERSION' }));
      expect(result(s).reason).toBe('PLAN_VERSION_UNKNOWN');
    },
  );
});
