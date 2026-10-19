import { describe, expect, it, vi } from 'vitest';
import {
  executePersonalLearningTextOperation,
  validatePersonalLearningTextOperation,
  type PersonalLearningTextOperation,
  type PersonalLearningTextOperationRepository,
  type AiCallMeasurement,
} from '../src';

const id = '11111111-1111-4111-8111-111111111111';
const input: PersonalLearningTextOperation = {
  actor: {
    actorUserId: id,
    scope: {
      workspaceId: id,
      groupId: id,
      programEnrollmentId: id,
      groupMembershipId: id,
      userId: id,
    },
  },
  requestId: id,
  expectedRequestRevision: 1,
  operationId: id,
  operationKind: 'LESSON_GENERATION',
  attempt: 1,
  provider: 'synthetic',
  promptVersion: 'TEST_V1',
  pricingRegistry: [],
  policy: {
    workspaceId: id,
    groupId: id,
    serviceProgramId: id,
    dailyAttemptLimit: 3,
    maxConcurrent: 1,
    model: 'synthetic',
    maxRequestBytes: 1000,
    maxOutputTokens: 100,
    dailyCostLimitUsdMicros: 10000,
  },
};
const measurement: AiCallMeasurement = {
  provider: 'synthetic',
  model: 'synthetic',
  inputTokens: 10,
  outputTokens: 5,
  cachedInputTokens: 0,
  latencyMs: 12,
  success: true,
  errorCategory: null,
  validationResult: 'PASSED',
  fallbackUsed: false,
  occurredAt: new Date().toISOString(),
};
const permit = { id, operationHash: 'a'.repeat(64), maxRequestBytes: 1000, maxOutputTokens: 100 };
function repository() {
  return {
    admit: vi.fn().mockResolvedValue(permit),
    record: vi.fn().mockResolvedValue(undefined),
  } satisfies PersonalLearningTextOperationRepository;
}
describe('preassignment text operation', () => {
  it('accepts only a bounded, non-topic nudge context and rejects learner-derived fields', () => {
    const nudge = {
      ...input,
      operationKind: 'NUDGE_COPY' as const,
      nudge: { situation: 'STUCK' as const, ordinal: 1 as const, judgmentDate: '2026-10-19' },
    };
    expect(() => validatePersonalLearningTextOperation(nudge)).not.toThrow();
    expect(() =>
      validatePersonalLearningTextOperation({ ...nudge, freeText: 'learner answer' } as never),
    ).toThrow();
    expect(() =>
      validatePersonalLearningTextOperation({
        ...nudge,
        actor: { ...nudge.actor, topicId: id },
      }),
    ).toThrow();
    expect(() =>
      validatePersonalLearningTextOperation({
        ...nudge,
        nudge: { ...nudge.nudge, judgmentDate: '2026-02-30' },
      }),
    ).toThrow();
  });

  it('passes real operation identity and limits without an Assignment/Answer', async () => {
    const repo = repository();
    const call = vi
      .fn()
      .mockResolvedValue({ value: 'synthetic candidate', measurement, requestFinished: true });
    expect(await executePersonalLearningTextOperation(repo, input, call)).toBe(
      'synthetic candidate',
    );
    expect(call).toHaveBeenCalledWith(permit);
    expect(repo.record).toHaveBeenCalledWith({
      operation: input,
      permit,
      measurement,
      requestFinished: true,
    });
    expect(input).not.toHaveProperty('assignmentId');
    expect(input).not.toHaveProperty('answerId');
  });
  it('does not call the Provider when admission is denied', async () => {
    const repo = repository();
    repo.admit.mockRejectedValue(new Error('denied'));
    const call = vi.fn();
    await expect(executePersonalLearningTextOperation(repo, input, call)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
    expect(repo.record).not.toHaveBeenCalled();
  });
  it('records an opaque failure as unknown and does not retry or release', async () => {
    const repo = repository();
    const call = vi.fn().mockRejectedValue(new Error('synthetic private input'));
    await expect(executePersonalLearningTextOperation(repo, input, call)).rejects.toThrow(
      'learning text operation failed',
    );
    expect(call).toHaveBeenCalledTimes(1);
    expect(repo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        requestFinished: false,
        measurement: expect.objectContaining({
          inputTokens: null,
          success: false,
          errorCategory: 'UNKNOWN',
        }),
      }),
    );
    expect(JSON.stringify(repo.record.mock.calls)).not.toContain('synthetic private input');
  });
  it('does not return successful output if durable usage recording fails', async () => {
    const repo = repository();
    repo.record.mockRejectedValue(new Error('record failed'));
    await expect(
      executePersonalLearningTextOperation(
        repo,
        input,
        vi.fn().mockResolvedValue({ value: 'candidate', measurement, requestFinished: true }),
      ),
    ).rejects.toThrow('record failed');
  });
  it('records a malformed or wrong-model result as unknown, not successful', async () => {
    const repo = repository();
    await expect(
      executePersonalLearningTextOperation(
        repo,
        input,
        vi.fn().mockResolvedValue({
          value: 'candidate',
          measurement: { ...measurement, model: 'different' },
          requestFinished: true,
        }),
      ),
    ).rejects.toThrow();
    expect(repo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        measurement: expect.objectContaining({ model: 'synthetic', success: false }),
      }),
    );
  });
  it.each([0, 4, 1.5])('rejects unbounded or invalid attempt %s', (attempt) => {
    expect(() => validatePersonalLearningTextOperation({ ...input, attempt })).toThrow();
  });
  it('rejects image operations, invalid authority and fake identifiers', () => {
    expect(() =>
      validatePersonalLearningTextOperation({
        ...input,
        operationKind: 'IMAGE_SUPPORT' as 'LESSON_GENERATION',
      }),
    ).toThrow();
    expect(() => validatePersonalLearningTextOperation({ ...input, requestId: 'fake' })).toThrow();
    expect(() =>
      validatePersonalLearningTextOperation({
        ...input,
        actor: { ...input.actor, actorUserId: '22222222-2222-4222-8222-222222222222' },
      }),
    ).toThrow();
  });
});
