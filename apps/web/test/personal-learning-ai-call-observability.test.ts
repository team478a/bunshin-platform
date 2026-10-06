import { afterEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ resolve: vi.fn(), record: vi.fn(), log: vi.fn() }));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningAiCallRepository: class {
    resolve = fake.resolve;
    record = fake.record;
  },
}));
vi.mock('@bunshin/observability', () => ({ createLogger: () => ({ error: fake.log }) }));
import {
  personalLearningPricingRegistry,
  preparePersonalLearningAiCall,
} from '../src/observability/personal-learning-ai-call';
const actor = {
  actorUserId: 'user',
  scope: {
    workspaceId: 'workspace',
    groupId: 'group',
    programEnrollmentId: 'enrollment',
    groupMembershipId: 'membership',
    userId: 'user',
  },
};
const m = {
  provider: 'openai',
  model: 'synthetic',
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  latencyMs: 10,
  success: false,
  errorCategory: 'TIMEOUT' as const,
  validationResult: 'NOT_RUN' as const,
  fallbackUsed: false,
  occurredAt: '2026-10-06T00:00:00Z',
};
describe('Pilot observation persistence and pricing configuration', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });
  it('no configured price is UNKNOWN; invalid config emits a fixed diagnostic only', () => {
    vi.stubEnv('PERSONAL_LEARNING_AI_PRICING', '[]');
    expect(personalLearningPricingRegistry()).toEqual([]);
    vi.stubEnv('PERSONAL_LEARNING_AI_PRICING', 'secret raw invalid JSON');
    expect(personalLearningPricingRegistry()).toEqual([]);
    expect(fake.log).toHaveBeenCalledWith('Personal Learning pricing unavailable', {
      errorCode: 'PERSONAL_LEARNING_PRICING_INVALID',
    });
    expect(JSON.stringify(fake.log.mock.calls)).not.toContain('secret raw');
  });
  it('retains scope and attempt relation; recording outage does not recall the Provider', async () => {
    const observation = await preparePersonalLearningAiCall(actor, 'assignment', 'answer');
    expect(fake.resolve).toHaveBeenCalledWith(actor, 'assignment', 'answer');
    fake.record.mockRejectedValue(new Error('private response'));
    await observation.record('attempt', m);
    expect(fake.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        assignmentId: 'assignment',
        answerId: 'answer',
        usageKey: 'attempt',
        measurement: m,
      }),
    );
    expect(fake.log).toHaveBeenCalledWith('Personal Learning AI call persistence failed', {
      errorCode: 'PERSONAL_LEARNING_AI_CALL_PERSISTENCE_FAILED',
    });
    expect(JSON.stringify(fake.log.mock.calls)).not.toContain('private response');
  });
});
