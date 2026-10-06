import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import {
  projectProgramMemberGoalReference,
  type LearningConsultationRequest,
} from '@bunshin/application';
import {
  consultAiTrainingLearning,
  projectAiTrainingLearnerProfiles,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
} from '@bunshin/capability-training';
const f = vi.hoisted(() => ({
  actor: vi.fn(),
  access: vi.fn(),
  sameOrigin: vi.fn(),
  read: vi.fn(),
  consult: vi.fn(),
  goal: vi.fn(),
  confirm: vi.fn(),
  bridge: vi.fn(),
  feedback: vi.fn(),
  assignment: vi.fn(),
  readiness: vi.fn(),
  save: vi.fn(),
  storedGoal: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.sameOrigin }));
vi.mock('../src/services/personal-learning-pilot-access', () => ({
  resolvePersonalLearningPilot: f.access,
}));
vi.mock('@bunshin/database', () => ({
  prisma: { programMemberGoal: { findFirst: f.storedGoal } },
  PrismaPersonalLearningPilotRepository: class {
    read = f.read;
    consult = f.consult;
    confirmGoal = f.goal;
    confirmPlan = f.confirm;
    currentAssignment = f.assignment;
    feedback = f.feedback;
    readiness = f.readiness;
    savePlan = f.save;
  },
  PrismaPersonalLearningPilotRouter: class {
    bridge = f.bridge;
  },
}));
import { personalLearningPilotResponse } from '../src/http/personal-learning-pilot';
const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  programEnrollmentId: '00000000-0000-4000-8000-000000000003',
  groupMembershipId: '00000000-0000-4000-8000-000000000004',
  userId: '00000000-0000-4000-8000-000000000005',
};
const idempotencyKey = '00000000-0000-4000-8000-000000000006';
function request(value?: unknown) {
  return new Request(
    'http://localhost/api/pilot',
    value === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(value),
        },
  );
}
const call = (value?: unknown) =>
  personalLearningPilotResponse(request(value), 'synthetic', scope.programEnrollmentId);
const consultationContext = () => ({
  scope,
  ...projectAiTrainingLearnerProfiles({ scope, profile: null, goals: [] }),
  approvedDefinitionRefs: AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((item) => item.reference),
});
describe('Personal Learning pilot HTTP composition', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.actor.mockResolvedValue({ userId: scope.userId });
    f.access.mockResolvedValue({ scope, actorUserId: scope.userId });
    f.readiness.mockResolvedValue({ profileReady: true, approvalReady: true });
    f.read.mockResolvedValue({ goals: [], plans: [] });
    f.consult.mockImplementation((input: { consultation: LearningConsultationRequest }) =>
      Promise.resolve(consultAiTrainingLearning(consultationContext(), input.consultation)),
    );
  });
  it('reads durable state without bridge or writes', async () => {
    const result = await call();
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(f.bridge).not.toHaveBeenCalled();
    expect(f.goal).not.toHaveBeenCalled();
  });
  it('recovers a DRAFT Plan from the existing Goal, without client refs or automatic Plan confirmation', async () => {
    const reference = {
      kind: 'CONFIRMED_GOAL_REFERENCE' as const,
      confirmedByUserId: scope.userId,
      reference: projectProgramMemberGoalReference(scope, {
        ...scope,
        id: idempotencyKey,
        status: 'ACTIVE',
        goalDefinitionId: null,
      }),
      semanticRef: {
        packageKey: 'AI_TRAINING',
        goalKey: 'USE_AI_IN_DAILY_WORK',
        version: 'AI_TRAINING_LEARNING_CATALOG_V1',
      },
    };
    // Semantic version must match the real Package catalog, never a test-only permissive contract.
    const mapped = consultAiTrainingLearning(consultationContext(), {
      scope,
      text: 'プロンプトを学びたい',
      answers: [{ questionKey: 'AI_EXPERIENCE', answerKey: 'UNKNOWN' }],
    });
    if (mapped.status !== 'GOAL_CANDIDATE') throw new Error('synthetic candidate unavailable');
    reference.semanticRef = mapped.candidate.goal.semanticRef;
    f.read.mockResolvedValue({ goals: [{ reference }], plans: [] });
    f.storedGoal.mockResolvedValue({ title: mapped.candidate.learningObjective });
    const response = await call({ operation: 'PREPARE_PLAN', goalId: idempotencyKey });
    expect(response.status).toBe(200);
    const plan = (await response.json()).data;
    expect(plan.status).toBe('DRAFT');
    expect(plan.confirmation).toBeNull();
    expect(plan.steps).toHaveLength(3);
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.confirm).not.toHaveBeenCalled();
    expect(f.bridge).not.toHaveBeenCalled();
  });
  it('A/B: runs P1-A/P1-D on the server and explicitly confirms content conversion', async () => {
    const base = { operation: 'CONSULT', telemetryKey: idempotencyKey };
    let response = await call({
      ...base,
      consultation: { text: '営業メールを書いて', answers: [] },
    });
    let data = (await response.json()).data;
    expect(data.status).toBe('ASKING');
    expect(data.question.key).toBe('LEARNING_CONVERSION');
    response = await call({
      ...base,
      consultation: {
        text: '営業メールを書いて',
        answers: [
          { questionKey: 'LEARNING_CONVERSION', answerKey: 'YES' },
          { questionKey: 'AI_EXPERIENCE', answerKey: 'UNKNOWN' },
        ],
      },
    });
    data = (await response.json()).data;
    expect(data.status).toBe('GOAL_CANDIDATE');
    expect(f.goal).not.toHaveBeenCalled();
    expect(f.bridge).not.toHaveBeenCalled();
  });
  it.each(['集客をどうしたらいい？', '今日の天気'])(
    'C: creates no Goal for outside-scope input %s',
    async (text) => {
      const result = await call({
        operation: 'CONSULT',
        telemetryKey: idempotencyKey,
        consultation: { text, answers: [] },
      });
      expect((await result.json()).data.status).toBe('OUTSIDE_SCOPE');
      expect(f.goal).not.toHaveBeenCalled();
    },
  );
  it.each(['画像生成を学びたい', 'AIエージェントについて学びたい', '自動化の仕組みを学びたい'])(
    'D: returns unsupported Definition gap %s',
    async (text) => {
      const result = await call({
        operation: 'CONSULT',
        telemetryKey: idempotencyKey,
        consultation: { text, answers: [] },
      });
      expect((await result.json()).data.status).toBe('LEARNING_DEFINITION_GAP');
    },
  );
  it('E/F/G: calls only the gated bridge, leaving completion to existing rules', async () => {
    for (const status of ['REVIEW', 'RETRY', 'PLAN_COMPLETED']) {
      f.bridge.mockResolvedValue({ result: { status } });
      const response = await call({
        operation: 'NEXT',
        planId: idempotencyKey,
        revision: 1,
        idempotencyKey,
      });
      expect((await response.json()).data.result.status).toBe(status);
      expect(f.bridge).toHaveBeenLastCalledWith({
        scope,
        actorUserId: scope.userId,
        planId: idempotencyKey,
        expectedRevision: 1,
        idempotencyKey,
      });
    }
  });
  it('H/J: rejects unauthenticated and denied participant before reading/writing', async () => {
    f.actor.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    f.actor.mockResolvedValue({ userId: scope.userId });
    f.access.mockRejectedValue(new ApplicationError('NOT_FOUND', 'denied'));
    expect((await call()).status).toBe(404);
    expect(f.read).not.toHaveBeenCalled();
  });
  it('rejects client scope, forged candidate-only input and cross-origin writes', async () => {
    expect(
      (
        await call({
          operation: 'CONSULT',
          telemetryKey: idempotencyKey,
          consultation: { text: 'プロンプトを学びたい', answers: [], scope },
        })
      ).status,
    ).toBe(400);
    expect(
      (await call({ operation: 'CONFIRM_GOAL', candidateKey: 'fake', idempotencyKey })).status,
    ).toBe(400);
    f.sameOrigin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin');
    });
    expect(
      (
        await call({
          operation: 'CONFIRM_PLAN',
          planId: idempotencyKey,
          revision: 1,
          idempotencyKey,
        })
      ).status,
    ).toBe(403);
    expect(f.confirm).not.toHaveBeenCalled();
  });
  it('saves no free-text feedback and does not expose private error details', async () => {
    expect(
      (
        await call({
          operation: 'FEEDBACK',
          assignmentId: idempotencyKey,
          fit: 'FIT',
          text: 'secret',
        })
      ).status,
    ).toBe(400);
    f.read.mockRejectedValue(new Error('private consultation content'));
    const response = await call();
    expect(await response.text()).not.toContain('private consultation content');
  });
});
