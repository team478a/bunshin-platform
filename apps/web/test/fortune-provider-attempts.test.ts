import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FortuneAiGenerationClaim } from '@bunshin/capability-fortune';
const mocks = vi.hoisted(() => ({
  runtime: vi.fn(),
  quota: vi.fn(),
  usage: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: mocks.runtime,
}));
vi.mock('../src/observability/ai-usage', () => ({ recordAiUsageSafely: mocks.usage }));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: mocks.quota,
}));
import { OpenAiFortuneReadingGenerator } from '../src/providers/openai-fortune-reading-generator';

const claim = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  bunshinId: 'bunshin-a',
  reading: { id: 'reading-a', body: '承認済み本文', actionStep: '小さな行動' },
  jobAttempt: { jobId: 'job-a', attemptCount: 1 },
} as FortuneAiGenerationClaim;
const success = () =>
  Response.json({
    model: 'mock-model',
    usage: { input_tokens: 12, output_tokens: 15 },
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              body: '今日は自分の気持ちを大切にしましょう。',
              actionStep: '気持ちを一つ書きましょう。',
            }),
          },
        ],
      },
    ],
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.runtime.mockResolvedValue({
    apiKey: 'test-only-not-a-real-key',
    model: 'mock-model',
    requestCostUsdMicros: 100,
  });
  mocks.quota.mockImplementation((input: { generate(): Promise<unknown> }) => input.generate());
  mocks.usage.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue(success());
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('fortune provider attempts', () => {
  it('uses separate quota and usage keys per attempt while retaining model, cost and tokens', async () => {
    const generator = new OpenAiFortuneReadingGenerator();
    mocks.fetch.mockImplementation(() => Promise.resolve(success()));
    for (const attemptCount of [1, 2])
      await generator.generate({
        serviceSlug: 'fortune-a',
        actorUserId: 'user-a',
        claim: { ...claim, jobAttempt: { jobId: 'job-a', attemptCount } },
      });
    expect(mocks.quota).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationKey: 'fortune-reading:reading-a:job-a:attempt:1',
        workspaceId: 'workspace-a',
        groupId: 'group-a',
      }),
    );
    expect(mocks.usage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: 'fortune-reading:reading-a:job-a:attempt:2',
        status: 'SUCCESS',
        inputTokens: 12,
        outputTokens: 15,
        estimatedCostUsdMicros: 100,
        model: 'mock-model',
        latencyMs: expect.any(Number),
      }),
    );
  });

  it('checks authorization inside the quota callback before making a request', async () => {
    const assertAllowed = vi.fn().mockRejectedValue(new Error('revoked'));
    await expect(
      new OpenAiFortuneReadingGenerator().generate({
        serviceSlug: 'fortune-a',
        actorUserId: 'user-a',
        claim,
        assertAllowed,
      }),
    ).rejects.toThrow('revoked');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', estimatedCostUsdMicros: null }),
    );
  });

  it('retains only a safe HTTP status, not the provider error body', async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({ error: { message: 'private-provider-details' } }, { status: 401 }),
    );
    await expect(
      new OpenAiFortuneReadingGenerator().generate({
        serviceSlug: 'fortune-a',
        actorUserId: 'user-a',
        claim,
      }),
    ).rejects.toMatchObject({ cause: { status: 401 } });
    expect(JSON.stringify(mocks.usage.mock.calls)).not.toContain('private-provider-details');
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        idempotencyKey: 'fortune-reading:reading-a:job-a:attempt:1',
      }),
    );
  });

  it('records unsafe output as a failure rather than a successful generation', async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  body: '絶対に成功します。',
                  actionStep: '今すぐ契約してください。',
                }),
              },
            ],
          },
        ],
      }),
    );
    await expect(
      new OpenAiFortuneReadingGenerator().generate({
        serviceSlug: 'fortune-a',
        actorUserId: 'user-a',
        claim,
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', errorCode: 'CONTENT_REJECTED' }),
    );
  });

  it('records invalid JSON without exposing content or treating it as transient', async () => {
    mocks.fetch.mockResolvedValue(new Response('private invalid body', { status: 200 }));
    await expect(
      new OpenAiFortuneReadingGenerator().generate({
        serviceSlug: 'fortune-a',
        actorUserId: 'user-a',
        claim,
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_REJECTED', cause: undefined });
    expect(JSON.stringify(mocks.usage.mock.calls)).not.toContain('private invalid body');
  });
});
