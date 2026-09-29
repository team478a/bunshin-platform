import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import type {
  FortuneAiGenerationClaim,
  FortuneAiReadingGenerator,
} from '@bunshin/capability-fortune';
import { createFortuneGenerationJobHandler } from '../src/jobs/fortune-generation-job-handler';

const input = {
  workspaceId: 'workspace-a',
  bunshinId: 'bunshin-a',
  serviceSettingId: 'setting-a',
  readingId: 'reading-a',
  actorUserId: 'user-a',
  jobId: 'job-a',
  workerId: 'worker-a',
  attemptCount: 1,
  maxAttempts: 3,
};
const revision = new Date('2026-09-29T05:00:00Z');
const claim = {
  workspaceId: input.workspaceId,
  groupId: 'group-a',
  bunshinId: input.bunshinId,
  generationRevision: revision,
  reading: { id: input.readingId },
  jobAttempt: { jobId: input.jobId, attemptCount: 1 },
} as FortuneAiGenerationClaim;
const output = {
  body: '今日は小さな一歩を大切にしましょう。',
  actionStep: '気持ちを一つ書きましょう。',
  model: 'test-model',
  promptVersion: 'test-v1',
  inputTokens: 5,
  outputTokens: 7,
  latencyMs: 10,
};

function setup() {
  const repository = {
    claimAiGeneration: vi.fn().mockResolvedValue(claim),
    completeAiGeneration: vi.fn().mockResolvedValue(null),
    fallbackAiGeneration: vi.fn().mockResolvedValue(null),
  };
  const generate = vi
    .fn<(value: Parameters<FortuneAiReadingGenerator['generate']>[0]) => Promise<typeof output>>()
    .mockImplementation(async (value) => {
      await value.assertAllowed?.();
      return output;
    });
  const deps = {
    repository,
    generator: { generate },
    resolveService: vi.fn().mockResolvedValue('fortune-a'),
    isCurrent: vi.fn().mockResolvedValue(true),
  };
  return { ...deps, generate, handler: createFortuneGenerationJobHandler(deps) };
}

describe('fortune generation worker', () => {
  it('generates and persists only a validated output with the lease and reading revision', async () => {
    const test = setup();
    await test.handler.execute(input);
    expect(test.repository.claimAiGeneration).toHaveBeenCalledWith({
      serviceSlug: 'fortune-a',
      actorUserId: 'user-a',
      readingId: 'reading-a',
      jobLease: input,
    });
    expect(test.isCurrent).toHaveBeenCalledOnce();
    expect(test.repository.completeAiGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ generationRevision: revision, jobLease: input, output }),
    );
  });

  it('never calls a provider for a missing/revoked/deleted/completed or foreign claim', async () => {
    const test = setup();
    test.repository.claimAiGeneration.mockResolvedValue(null);
    await test.handler.execute(input);
    expect(test.generate).not.toHaveBeenCalled();
  });

  it('rechecks scope after configuration and quota lookups', async () => {
    const test = setup();
    test.isCurrent.mockResolvedValue(false);
    await expect(test.handler.execute(input)).rejects.toMatchObject({
      category: 'FORTUNE_SCOPE_REVOKED',
      retryable: false,
    });
    expect(test.repository.completeAiGeneration).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])(
    'retries transient HTTP %s without discarding the basic result',
    async (status) => {
      const test = setup();
      test.generate.mockRejectedValue(
        new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider failure', { status }),
      );
      await expect(test.handler.execute(input)).rejects.toMatchObject({ retryable: true });
      expect(test.repository.fallbackAiGeneration).not.toHaveBeenCalled();
      expect(test.repository.completeAiGeneration).not.toHaveBeenCalled();
    },
  );

  it('retries a network timeout', async () => {
    const test = setup();
    test.generate.mockRejectedValue(
      new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'network', {
        category: 'TIMEOUT_OR_NETWORK',
      }),
    );
    await expect(test.handler.execute(input)).rejects.toMatchObject({ retryable: true });
  });

  it.each([400, 401, 403, 404])('does not retry permanent HTTP %s', async (status) => {
    const test = setup();
    test.generate.mockRejectedValue(
      new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider failure', { status }),
    );
    await expect(test.handler.execute(input)).rejects.toMatchObject({ retryable: false });
    expect(test.repository.fallbackAiGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ generationRevision: revision, jobLease: input }),
    );
  });

  it('falls back on the final transient failure', async () => {
    const test = setup();
    test.generate.mockRejectedValue(
      new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider failure', { status: 503 }),
    );
    await expect(test.handler.execute({ ...input, attemptCount: 3 })).rejects.toMatchObject({
      retryable: false,
    });
    expect(test.repository.fallbackAiGeneration).toHaveBeenCalledOnce();
  });

  it('does not call AI again after three interrupted attempts', async () => {
    const test = setup();
    await expect(test.handler.execute({ ...input, attemptCount: 4 })).rejects.toMatchObject({
      category: 'FORTUNE_ATTEMPTS_EXHAUSTED',
      retryable: false,
    });
    expect(test.generate).not.toHaveBeenCalled();
    expect(test.repository.fallbackAiGeneration).toHaveBeenCalledOnce();
  });

  it('rejects unsafe AI content without publishing or retrying', async () => {
    const test = setup();
    test.generate.mockResolvedValue({ ...output, body: '絶対に成功します。' });
    await expect(test.handler.execute(input)).rejects.toMatchObject({
      category: 'FORTUNE_OUTPUT_REJECTED',
      retryable: false,
    });
    expect(test.repository.completeAiGeneration).not.toHaveBeenCalled();
    expect(test.repository.fallbackAiGeneration).toHaveBeenCalledOnce();
  });

  it('does not treat a persistence outage as invalid AI content', async () => {
    const test = setup();
    test.repository.completeAiGeneration.mockRejectedValue(new Error('database unavailable'));
    await expect(test.handler.execute(input)).rejects.toThrow('database unavailable');
    expect(test.repository.fallbackAiGeneration).not.toHaveBeenCalled();
  });
});
