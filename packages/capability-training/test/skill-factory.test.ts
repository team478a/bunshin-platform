import { describe, expect, it } from 'vitest';
import {
  AI_TRAINING_SKILL_FACTORY_V1,
  TRAINING_SKILL_FACTORY_FEASIBILITY_AXES,
  canApproveTrainingSkillFactory,
  defineTrainingMissionHelpProblemV1,
  defineTrainingMissionSupportSkillDraftV1,
  defineTrainingSupportDraftArtifactV1,
  evaluateTrainingSkillDraftFeasibilityV1,
  validateTrainingSupportDraftV1,
  type DefineTrainingMissionHelpProblemV1Input,
  type TrainingSkillDraftFeasibilityCheckV1,
  type TrainingSkillFactoryFeasibilityAxis,
} from '../src/index';

const occurredAt = new Date('2026-10-05T00:00:00.000Z');
const now = new Date('2026-10-06T00:00:00.000Z');
const scope = {
  workspaceId: 'workspace-1',
  serviceId: 'service-1',
  programEnrollmentId: 'enrollment-1',
  missionAssignmentId: 'assignment-1',
};

const problemInput = (
  overrides: Partial<DefineTrainingMissionHelpProblemV1Input> = {},
): DefineTrainingMissionHelpProblemV1Input => ({
  problemId: 'problem-1',
  revision: 1,
  status: 'APPROVED',
  scope,
  source: {
    ...scope,
    actionEventId: 'event-1',
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
});

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

const draftFor = (problem = defineTrainingMissionHelpProblemV1(problemInput())) =>
  defineTrainingMissionSupportSkillDraftV1({
    skillDraftId: 'draft-1',
    revision: 1,
    sourceProblemId: problem.problemId,
    sourceProblemRevision: problem.revision,
    scopeFingerprint: 'sha256:scope',
    missionDefinitionKey: problem.mission.missionDefinitionKey,
    learningObjectiveKey: problem.contextProjection.learningObjectiveKey,
    requiredInputKeys: ['MISSION_OBJECTIVE'],
    prohibitedInputClasses: ['ANSWER_TEXT', 'MEMORY', 'DIRECT_USER_ID'],
    steps: ['目的を確認する', '例を一つ使って試す'],
    expectedOutput: '元の目的を変えない次の一歩',
    status: 'DRAFT',
    expiresAt: problem.expiresAt,
  });

const artifactFor = (
  problem = defineTrainingMissionHelpProblemV1(problemInput()),
  draft = draftFor(problem),
) =>
  defineTrainingSupportDraftArtifactV1({
    artifactId: 'artifact-1',
    revision: 1,
    sourceProblemId: problem.problemId,
    sourceProblemRevision: problem.revision,
    skillDraftId: draft.skillDraftId,
    skillDraftRevision: draft.revision,
    scopeFingerprint: draft.scopeFingerprint,
    programTemplateVersionId: problem.mission.programTemplateVersionId,
    missionDefinitionKey: problem.mission.missionDefinitionKey,
    learningObjectiveKey: problem.contextProjection.learningObjectiveKey,
    successCriteriaKeys: problem.contextProjection.relevantSuccessCriteriaKeys,
    barrierReasonCode: problem.contextProjection.barrierReasonCode,
    steps: draft.steps,
    expectedOutput: draft.expectedOutput,
    createdAt: occurredAt,
    expiresAt: problem.expiresAt,
  });

describe('AI training Skill Factory V1 pure contract', () => {
  it('limits the problem to seven days and caps it at enrollment end', () => {
    const sevenDays = defineTrainingMissionHelpProblemV1(problemInput());
    const enrollmentEnd = new Date('2026-10-08T00:00:00.000Z');
    const capped = defineTrainingMissionHelpProblemV1(
      problemInput({ enrollmentEndsAt: enrollmentEnd }),
    );

    expect(sevenDays.contractVersion).toBe(AI_TRAINING_SKILL_FACTORY_V1);
    expect(sevenDays.expiresAt.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(capped.expiresAt).toEqual(enrollmentEnd);
  });

  it('accepts only active service owners and admins as approvers', () => {
    expect(canApproveTrainingSkillFactory({ serviceRole: 'SERVICE_OWNER', active: true })).toBe(
      true,
    );
    expect(canApproveTrainingSkillFactory({ serviceRole: 'SERVICE_ADMIN', active: true })).toBe(
      true,
    );
    expect(canApproveTrainingSkillFactory({ serviceRole: 'CONTENT_EDITOR', active: true })).toBe(
      false,
    );
    expect(canApproveTrainingSkillFactory({ serviceRole: 'SERVICE_OWNER', active: false })).toBe(
      false,
    );
  });

  it('rejects cross-scope, non-help, and non-training sources', () => {
    expect(() =>
      defineTrainingMissionHelpProblemV1(
        problemInput({ source: { ...problemInput().source, serviceId: 'service-2' } }),
      ),
    ).toThrow('problem source scope mismatch');
    expect(() =>
      defineTrainingMissionHelpProblemV1(
        problemInput({
          source: { ...problemInput().source, eventType: 'HINT_VIEWED' } as never,
        }),
      ),
    ).toThrow('unsupported problem event');
    expect(() =>
      defineTrainingMissionHelpProblemV1(
        problemInput({ source: { ...problemInput().source, moduleKey: 'SOCIAL' } as never }),
      ),
    ).toThrow('unsupported problem module');
    expect(() =>
      defineTrainingMissionHelpProblemV1(
        problemInput({
          mission: { ...problemInput().mission, missionDefinitionKey: 'UNKNOWN_MISSION' } as never,
        }),
      ),
    ).toThrow('unknown missionDefinitionKey');
  });

  it('keeps a missing barrier null and accepts only the existing fixed codes', () => {
    expect(
      defineTrainingMissionHelpProblemV1(problemInput()).contextProjection.barrierReasonCode,
    ).toBe(null);
    expect(
      defineTrainingMissionHelpProblemV1(
        problemInput({
          contextProjection: {
            ...problemInput().contextProjection,
            barrierReasonCode: 'DONT_KNOW_HOW',
          },
        }),
      ).contextProjection.barrierReasonCode,
    ).toBe('DONT_KNOW_HOW');
    expect(() =>
      defineTrainingMissionHelpProblemV1(
        problemInput({
          contextProjection: {
            ...problemInput().contextProjection,
            barrierReasonCode: 'GUESSED_REASON',
          } as never,
        }),
      ),
    ).toThrow('invalid barrierReasonCode');
  });

  it('does not promote UNKNOWN feasibility and gives BLOCKED precedence', () => {
    const unknown = passedChecks();
    unknown.BUDGET = { ...unknown.BUDGET, status: 'UNKNOWN' };
    const unknownResult = evaluateTrainingSkillDraftFeasibilityV1(unknown);
    expect(unknownResult.outcome).toBe('REVIEW_REQUIRED');
    expect(unknownResult.externalAiCostYen).toBe(0);
    expect(unknownResult.automaticDeliveryEnabled).toBe(false);

    const blocked = { ...unknown };
    blocked.SCOPE = { ...blocked.SCOPE, status: 'BLOCKED' };
    expect(evaluateTrainingSkillDraftFeasibilityV1(blocked).outcome).toBe('BLOCKED');
  });

  it('validates a fully matched, approved, zero-cost draft artifact', () => {
    const problem = defineTrainingMissionHelpProblemV1(problemInput());
    const skillDraft = draftFor(problem);
    const artifact = artifactFor(problem, skillDraft);
    const receipt = validateTrainingSupportDraftV1({
      problem,
      feasibility: evaluateTrainingSkillDraftFeasibilityV1(passedChecks()),
      skillDraft,
      artifact,
      now,
    });

    expect(receipt.status).toBe('VALID');
    expect(receipt.reasonCodes).toEqual([]);
  });

  it('rejects stale revisions, changed objectives, and expired problems', () => {
    const problem = defineTrainingMissionHelpProblemV1(problemInput());
    const skillDraft = draftFor(problem);
    const artifact = artifactFor(problem, skillDraft);
    const receipt = validateTrainingSupportDraftV1({
      problem: { ...problem, expiresAt: now },
      feasibility: evaluateTrainingSkillDraftFeasibilityV1(passedChecks()),
      skillDraft: {
        ...skillDraft,
        sourceProblemRevision: 2,
        learningObjectiveKey: 'CHANGED_OBJECTIVE',
      },
      artifact,
      now,
    });

    expect(receipt.status).toBe('INVALID');
    expect(receipt.reasonCodes).toEqual(
      expect.arrayContaining([
        'PROBLEM_EXPIRED',
        'PROBLEM_REVISION_MISMATCH',
        'LEARNING_OBJECTIVE_CHANGED',
      ]),
    );
  });

  it('rejects changed artifact content, unusable drafts, and extended expiry', () => {
    const problem = defineTrainingMissionHelpProblemV1(problemInput());
    const skillDraft = draftFor(problem);
    const artifact = artifactFor(problem, skillDraft);
    const receipt = validateTrainingSupportDraftV1({
      problem,
      feasibility: evaluateTrainingSkillDraftFeasibilityV1(passedChecks()),
      skillDraft: {
        ...skillDraft,
        status: 'REVOKED',
        expiresAt: new Date(problem.expiresAt.getTime() + 1),
      },
      artifact: { ...artifact, steps: ['別の手順'] },
      now,
    });

    expect(receipt.reasonCodes).toEqual(
      expect.arrayContaining([
        'DRAFT_NOT_USABLE',
        'ARTIFACT_REFERENCE_MISMATCH',
        'ARTIFACT_CONTENT_MISMATCH',
      ]),
    );
  });

  it('enforces five steps, 200 characters per step, and a 4 KiB artifact', () => {
    const problem = defineTrainingMissionHelpProblemV1(problemInput());
    expect(() =>
      defineTrainingMissionSupportSkillDraftV1({
        ...draftFor(problem),
        steps: Array.from({ length: 6 }, (_, index) => `step-${index}`),
      }),
    ).toThrow('invalid steps');
    expect(() =>
      defineTrainingMissionSupportSkillDraftV1({
        ...draftFor(problem),
        steps: ['あ'.repeat(201)],
      }),
    ).toThrow('invalid step');

    const draft = draftFor(problem);
    expect(() =>
      defineTrainingSupportDraftArtifactV1({
        ...artifactFor(problem, draft),
        expectedOutput: 'あ'.repeat(500),
        scopeFingerprint: 'x'.repeat(160),
        successCriteriaKeys: Array.from(
          { length: 10 },
          (_, index) => `criterion-${index}-${'x'.repeat(60)}`,
        ),
        steps: Array.from({ length: 5 }, () => 'あ'.repeat(200)),
      }),
    ).toThrow('artifact exceeds byte limit');
  });

  it('rejects prohibited data classes before creating a portable contract', () => {
    expect(() =>
      defineTrainingMissionHelpProblemV1({
        ...problemInput(),
        answerText: 'private answer',
      } as never),
    ).toThrow('forbidden field: answerText');
    expect(() =>
      defineTrainingMissionSupportSkillDraftV1({
        ...draftFor(),
        userId: 'user-1',
      } as never),
    ).toThrow('forbidden field: userId');
    expect(() =>
      defineTrainingSupportDraftArtifactV1({
        ...artifactFor(),
        workspaceId: 'workspace-1',
      } as never),
    ).toThrow('forbidden portable field: workspaceId');
  });
});
