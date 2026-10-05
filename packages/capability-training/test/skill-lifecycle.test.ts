import { describe, expect, it } from 'vitest';
import {
  TRAINING_SKILL_FACTORY_FEASIBILITY_AXES,
  TRAINING_SUPPORT_SKILL_ROLLBACK_AXES,
  activateTrainingSupportSkillVersionV1,
  adoptTrainingSupportSkillVersionV1,
  approveNextTrainingSupportSkillVersionV1,
  defineTrainingMissionHelpProblemV1,
  defineTrainingMissionSupportSkillDraftV1,
  defineTrainingSupportDraftArtifactV1,
  evaluateTrainingSkillDraftFeasibilityV1,
  retireTrainingSupportSkillV1,
  revokeTrainingSupportSkillVersionV1,
  rollbackTrainingSupportSkillVersionV1,
  suspendTrainingSupportSkillV1,
  validateTrainingSupportDraftV1,
  type DefineTrainingMissionHelpProblemV1Input,
  type TrainingSkillDraftFeasibilityCheckV1,
  type TrainingSkillFactoryFeasibilityAxis,
  type TrainingSupportSkillLifecycleStateV1,
  type TrainingSupportSkillRollbackAxis,
  type TrainingSupportSkillRollbackCompatibilityV1,
} from '../src/index';

const occurredAt = new Date('2026-10-05T00:00:00.000Z');
const now = new Date('2026-10-06T00:00:00.000Z');
const later = new Date('2026-10-07T00:00:00.000Z');
const actor = { userId: 'owner-1', serviceRole: 'SERVICE_OWNER', active: true };
const digest = `sha256:${'a'.repeat(64)}` as const;

const problemInput = (
  suffix = '1',
  overrides: Partial<DefineTrainingMissionHelpProblemV1Input> = {},
): DefineTrainingMissionHelpProblemV1Input => {
  const scope = {
    workspaceId: 'workspace-1',
    serviceId: 'service-1',
    programEnrollmentId: `enrollment-${suffix}`,
    missionAssignmentId: `assignment-${suffix}`,
  };
  return {
    problemId: `problem-${suffix}`,
    revision: 1,
    status: 'APPROVED',
    scope,
    source: {
      ...scope,
      actionEventId: `event-${suffix}`,
      actionEventSchemaVersion: 1,
      eventType: 'HELP_REQUESTED',
      moduleKey: 'AI_TRAINING_V1',
      occurredAt,
    },
    mission: {
      programTemplateVersionId: 'template-version-1',
      missionDefinitionKey: 'PROMPT_BASIC',
      missionRuleVersion: 'AI_TRAINING_V1_RULES_4',
      assignmentVariant: 'STANDARD',
    },
    contextProjection: {
      learningObjectiveKey: 'PROMPT_BASIC_OBJECTIVE',
      relevantSuccessCriteriaKeys: ['HAS_PURPOSE'],
      barrierReasonCode: null,
      evaluatedSkillKeys: ['promptStructure'],
    },
    enrollmentEndsAt: null,
    ...overrides,
  };
};

const passedChecks = () =>
  Object.fromEntries(
    TRAINING_SKILL_FACTORY_FEASIBILITY_AXES.map((axis) => [
      axis,
      {
        status: 'PASSED',
        reasonCode: `${axis}_CONFIRMED`,
        confirmedRevision: 'revision-1',
        checkedAt: now,
      } satisfies TrainingSkillDraftFeasibilityCheckV1,
    ]),
  ) as Record<TrainingSkillFactoryFeasibilityAxis, TrainingSkillDraftFeasibilityCheckV1>;

const evidence = (suffix = '1', overrides: { serviceId?: string; steps?: string[] } = {}) => {
  const base = problemInput(suffix);
  const problem = defineTrainingMissionHelpProblemV1(
    problemInput(suffix, {
      scope: { ...base.scope, serviceId: overrides.serviceId ?? base.scope.serviceId },
      source: { ...base.source, serviceId: overrides.serviceId ?? base.source.serviceId },
    }),
  );
  const feasibility = evaluateTrainingSkillDraftFeasibilityV1(passedChecks());
  const skillDraft = defineTrainingMissionSupportSkillDraftV1({
    skillDraftId: `draft-${suffix}`,
    revision: 1,
    sourceProblemId: problem.problemId,
    sourceProblemRevision: problem.revision,
    scopeFingerprint: `sha256:scope-${suffix}`,
    missionDefinitionKey: problem.mission.missionDefinitionKey,
    learningObjectiveKey: problem.contextProjection.learningObjectiveKey,
    requiredInputKeys: ['MISSION_OBJECTIVE'],
    prohibitedInputClasses: ['ANSWER_TEXT', 'MEMORY', 'DIRECT_USER_ID'],
    steps: overrides.steps ?? ['目的を確認する', '例を一つ使って試す'],
    expectedOutput: '元の目的を変えない次の一歩',
    status: 'VALIDATED',
    expiresAt: problem.expiresAt,
  });
  const artifact = defineTrainingSupportDraftArtifactV1({
    artifactId: `artifact-${suffix}`,
    revision: 1,
    sourceProblemId: problem.problemId,
    sourceProblemRevision: problem.revision,
    skillDraftId: skillDraft.skillDraftId,
    skillDraftRevision: skillDraft.revision,
    scopeFingerprint: skillDraft.scopeFingerprint,
    programTemplateVersionId: problem.mission.programTemplateVersionId,
    missionDefinitionKey: problem.mission.missionDefinitionKey,
    learningObjectiveKey: problem.contextProjection.learningObjectiveKey,
    successCriteriaKeys: problem.contextProjection.relevantSuccessCriteriaKeys,
    barrierReasonCode: problem.contextProjection.barrierReasonCode,
    steps: skillDraft.steps,
    expectedOutput: skillDraft.expectedOutput,
    createdAt: occurredAt,
    expiresAt: problem.expiresAt,
  });
  const validationReceipt = validateTrainingSupportDraftV1({
    problem,
    feasibility,
    skillDraft,
    artifact,
    now,
  });
  return { problem, feasibility, skillDraft, artifact, validationReceipt };
};

const adopt = (overrides: Record<string, unknown> = {}) => {
  const source = evidence();
  return adoptTrainingSupportSkillVersionV1({
    skillId: 'skill-1',
    skillVersionId: 'skill-version-1',
    skillKey: 'prompt-basic-next-step',
    contentDigest: digest,
    expectedSkillRevision: 0,
    operationId: 'operation-adopt-1',
    idempotencyKey: 'idempotency-adopt-1',
    reasonCode: 'INITIAL_HUMAN_APPROVAL',
    actor,
    ...source,
    now,
    ...overrides,
  });
};

const passedCompatibility = () =>
  Object.fromEntries(
    TRAINING_SUPPORT_SKILL_ROLLBACK_AXES.map((axis) => [axis, 'PASSED']),
  ) as Record<TrainingSupportSkillRollbackAxis, 'PASSED'>;

const activateV1 = (state = adopt()) =>
  activateTrainingSupportSkillVersionV1({
    state,
    skillVersionId: 'skill-version-1',
    expectedSkillRevision: state.skill.revision,
    operationId: 'operation-activate-1',
    idempotencyKey: 'idempotency-activate-1',
    reasonCode: 'HUMAN_APPROVED_ACTIVATION',
    actor,
    now,
  });

const addV2 = (state: TrainingSupportSkillLifecycleStateV1) => {
  const source = evidence('2', { steps: ['別の安全な一歩'] });
  return approveNextTrainingSupportSkillVersionV1({
    state,
    skillVersionId: 'skill-version-2',
    contentDigest: `sha256:${'b'.repeat(64)}`,
    expectedSkillRevision: state.skill.revision,
    operationId: 'operation-adopt-2',
    idempotencyKey: 'idempotency-adopt-2',
    reasonCode: 'INITIAL_HUMAN_APPROVAL',
    actor,
    ...source,
    now: later,
  });
};

describe('AI training Skill Lifecycle V1 persistence contract', () => {
  it('adopts a validated version without activating it', () => {
    const state = adopt();

    expect(state.skill.operationalStatus).toBe('SUSPENDED');
    expect(state.skill.currentVersionId).toBe(null);
    expect(state.versions).toHaveLength(1);
    expect(state.versions[0]?.disposition).toBe('APPROVED');
    expect(state.events[0]?.operation).toBe('ADOPT');
    expect(state.versions[0]?.steps).toEqual(['目的を確認する', '例を一つ使って試す']);
  });

  it('allows only active service owners and admins to adopt', () => {
    expect(() => adopt({ actor: { ...actor, active: false } })).toThrow(
      'skill lifecycle actor not authorized',
    );
    expect(() => adopt({ actor: { ...actor, serviceRole: 'CONTENT_EDITOR' } })).toThrow(
      'skill lifecycle actor not authorized',
    );
  });

  it('rejects an invalid or mismatched validation receipt', () => {
    const source = evidence();
    expect(() =>
      adopt({ validationReceipt: { ...source.validationReceipt, artifactRevision: 2 } }),
    ).toThrow('validation receipt mismatch');
    expect(() =>
      adopt({
        problem: { ...source.problem, status: 'REVOKED' },
        validationReceipt: source.validationReceipt,
      }),
    ).toThrow('skill adoption requires valid receipt');
  });

  it('activates an approved version only at the expected revision', () => {
    const adopted = adopt();
    expect(() =>
      activateTrainingSupportSkillVersionV1({
        state: adopted,
        skillVersionId: 'skill-version-1',
        expectedSkillRevision: 99,
        operationId: 'operation-activate-1',
        idempotencyKey: 'idempotency-activate-1',
        reasonCode: 'HUMAN_APPROVED_ACTIVATION',
        actor,
        now,
      }),
    ).toThrow('skill revision conflict');

    const active = activateV1(adopted);
    expect(active.skill.operationalStatus).toBe('ACTIVE');
    expect(active.skill.currentVersionId).toBe('skill-version-1');
    expect(active.versions[0]?.disposition).toBe('ACTIVE');
  });

  it('replays the same idempotency input and rejects a changed operation', () => {
    const active = activateV1();
    const replayed = activateTrainingSupportSkillVersionV1({
      state: active,
      skillVersionId: 'skill-version-1',
      expectedSkillRevision: 1,
      operationId: 'ignored-on-replay',
      idempotencyKey: 'idempotency-activate-1',
      reasonCode: 'HUMAN_APPROVED_ACTIVATION',
      actor,
      now: later,
    });
    expect(replayed).toEqual(active);
    expect(() =>
      suspendTrainingSupportSkillV1({
        state: active,
        expectedSkillRevision: active.skill.revision,
        operationId: 'operation-conflict',
        idempotencyKey: 'idempotency-activate-1',
        reasonCode: 'MANUAL_OPERATIONAL_STOP',
        actor,
        now: later,
      }),
    ).toThrow('idempotency key conflict');
  });

  it('adds a new immutable version only within the exact skill scope', () => {
    const active = activateV1();
    expect(() => {
      const wrongScope = evidence('2', { serviceId: 'service-2' });
      return approveNextTrainingSupportSkillVersionV1({
        state: active,
        skillVersionId: 'skill-version-2',
        contentDigest: `sha256:${'b'.repeat(64)}`,
        expectedSkillRevision: active.skill.revision,
        operationId: 'operation-adopt-2',
        idempotencyKey: 'idempotency-adopt-2',
        reasonCode: 'INITIAL_HUMAN_APPROVAL',
        actor,
        ...wrongScope,
        now: later,
      });
    }).toThrow('skill version scope mismatch');

    const next = addV2(active);
    expect(next.versions.map(({ version }) => version)).toEqual([1, 2]);
    expect(next.versions[0]?.steps).toEqual(active.versions[0]?.steps);
    expect(next.versions[1]?.disposition).toBe('APPROVED');
  });

  it('deprecates the current version when a new approved version is activated', () => {
    const withV2 = addV2(activateV1());
    const activeV2 = activateTrainingSupportSkillVersionV1({
      state: withV2,
      skillVersionId: 'skill-version-2',
      expectedSkillRevision: withV2.skill.revision,
      operationId: 'operation-activate-2',
      idempotencyKey: 'idempotency-activate-2',
      reasonCode: 'HUMAN_APPROVED_ACTIVATION',
      actor,
      now: later,
    });

    expect(activeV2.skill.currentVersionId).toBe('skill-version-2');
    expect(activeV2.versions.find(({ version }) => version === 1)?.disposition).toBe('DEPRECATED');
  });

  it('suspends new use while preserving the current version and history', () => {
    const active = activateV1();
    const suspended = suspendTrainingSupportSkillV1({
      state: active,
      expectedSkillRevision: active.skill.revision,
      operationId: 'operation-suspend-1',
      idempotencyKey: 'idempotency-suspend-1',
      reasonCode: 'SAFETY_REVIEW_REQUIRED',
      actor,
      now: later,
    });

    expect(suspended.skill.operationalStatus).toBe('SUSPENDED');
    expect(suspended.skill.currentVersionId).toBe('skill-version-1');
    expect(suspended.versions[0]?.disposition).toBe('ACTIVE');
  });

  it('keeps UNKNOWN rollback under review and reactivates only an all-PASSED version', () => {
    const withV2 = addV2(activateV1());
    const activeV2 = activateTrainingSupportSkillVersionV1({
      state: withV2,
      skillVersionId: 'skill-version-2',
      expectedSkillRevision: withV2.skill.revision,
      operationId: 'operation-activate-2',
      idempotencyKey: 'idempotency-activate-2',
      reasonCode: 'HUMAN_APPROVED_ACTIVATION',
      actor,
      now: later,
    });
    const unknown: TrainingSupportSkillRollbackCompatibilityV1 = passedCompatibility();
    unknown.VALIDATION_POLICY = 'UNKNOWN';
    expect(() =>
      rollbackTrainingSupportSkillVersionV1({
        state: activeV2,
        skillVersionId: 'skill-version-1',
        expectedSkillRevision: activeV2.skill.revision,
        operationId: 'operation-rollback-1',
        idempotencyKey: 'idempotency-rollback-1',
        reasonCode: 'CURRENT_VERSION_REGRESSION',
        compatibility: unknown,
        actor,
        now: later,
      }),
    ).toThrow('rollback review required');

    const rolledBack = rollbackTrainingSupportSkillVersionV1({
      state: activeV2,
      skillVersionId: 'skill-version-1',
      expectedSkillRevision: activeV2.skill.revision,
      operationId: 'operation-rollback-1',
      idempotencyKey: 'idempotency-rollback-1',
      reasonCode: 'CURRENT_VERSION_REGRESSION',
      compatibility: passedCompatibility(),
      actor,
      now: later,
    });
    expect(rolledBack.skill.currentVersionId).toBe('skill-version-1');
    expect(rolledBack.events.at(-1)?.operation).toBe('ROLLBACK');
  });

  it('revokes an active version fail-closed and never permits ordinary rollback', () => {
    const active = activateV1();
    const revoked = revokeTrainingSupportSkillVersionV1({
      state: active,
      skillVersionId: 'skill-version-1',
      expectedSkillRevision: active.skill.revision,
      operationId: 'operation-revoke-1',
      idempotencyKey: 'idempotency-revoke-1',
      reasonCode: 'SAFETY_POLICY_VIOLATION',
      actor,
      now: later,
    });
    expect(revoked.skill.operationalStatus).toBe('SUSPENDED');
    expect(revoked.skill.currentVersionId).toBe(null);
    expect(revoked.versions[0]?.disposition).toBe('REVOKED');
    expect(() =>
      rollbackTrainingSupportSkillVersionV1({
        state: revoked,
        skillVersionId: 'skill-version-1',
        expectedSkillRevision: revoked.skill.revision,
        operationId: 'operation-rollback-revoked',
        idempotencyKey: 'idempotency-rollback-revoked',
        reasonCode: 'MANUAL_VERSION_RESTORE',
        compatibility: passedCompatibility(),
        actor,
        now: later,
      }),
    ).toThrow('revoked skill version cannot activate');
  });

  it('retires the logical skill without deleting versions or events', () => {
    const active = activateV1();
    const retired = retireTrainingSupportSkillV1({
      state: active,
      expectedSkillRevision: active.skill.revision,
      operationId: 'operation-retire-1',
      idempotencyKey: 'idempotency-retire-1',
      reasonCode: 'SKILL_NO_LONGER_REQUIRED',
      actor,
      now: later,
    });

    expect(retired.skill.operationalStatus).toBe('RETIRED');
    expect(retired.skill.currentVersionId).toBe(null);
    expect(retired.versions).toHaveLength(1);
    expect(retired.events).toHaveLength(active.events.length + 1);
    expect(() =>
      activateTrainingSupportSkillVersionV1({
        state: retired,
        skillVersionId: 'skill-version-1',
        expectedSkillRevision: retired.skill.revision,
        operationId: 'operation-reactivate-retired',
        idempotencyKey: 'idempotency-reactivate-retired',
        reasonCode: 'HUMAN_APPROVED_ACTIVATION',
        actor,
        now: later,
      }),
    ).toThrow('retired skill cannot activate');
  });
});
