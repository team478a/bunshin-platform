import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ usage: vi.fn(), reserve: vi.fn(), quota: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  reserveOpenAiRuntimeConfiguration: mocks.reserve,
}));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: mocks.quota,
}));
vi.mock('../src/ai/openai-cost-admission', () => ({
  recordOpenAiUsageAndSettle: mocks.usage,
}));
import { selectFortuneIntakeQuestion } from '../src/providers/openai-fortune-intake';

const input = {
  id: 'turn',
  actorUserId: 'member',
  workspaceId: 'workspace',
  groupId: 'service',
  bunshinId: 'bunshin',
  consultation: '仕事を辞めたい',
  theme: 'WORK',
  answers: [{ key: 'REASON', answer: null }],
  profile: null,
  candidates: ['VALUES', 'GOAL'],
  allowed: () => Promise.resolve(true),
} as const;

function provider(output: object) {
  mocks.reserve.mockResolvedValue({
    apiKey: 'synthetic',
    model: 'fixture',
    requestCostUsdMicros: 90,
  });
  mocks.quota.mockImplementation((args: { generate: () => Promise<unknown> }) => args.generate());
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
      usage: { input_tokens: 50, output_tokens: 9 },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('Fortune dynamic question provider', () => {
  it('selects an eligible question, scopes cost and uses a closed output schema', async () => {
    const fetch = provider({ key: 'VALUES' });
    await expect(selectFortuneIntakeQuestion(input)).resolves.toBe('VALUES');
    expect(mocks.quota).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        groupId: 'service',
        operationKey: 'fortune-intake:turn',
      }),
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"enum":["VALUES","GOAL","DONE"]'),
      }),
    );
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'SUCCESS',
        promptVersion: 'fortune-dynamic-intake-v1',
        idempotencyKey: 'fortune-intake:turn',
        inputTokens: 50,
        outputTokens: 9,
      }),
    );
  });

  it.each([{ key: 'REASON' }, { key: 'UNKNOWN' }, { key: 'VALUES', diagnosis: 'invalid' }])(
    'fails closed for an invalid or repeated selection',
    async (output) => {
      provider(output);
      await expect(selectFortuneIntakeQuestion(input)).resolves.toBeNull();
      expect(mocks.usage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'FAILED',
          errorCode: 'CONTENT_REJECTED',
          estimatedCostUsdMicros: 90,
        }),
      );
    },
  );

  it('ends without a question when the consultation is sufficient', async () => {
    provider({ key: 'DONE' });
    await expect(selectFortuneIntakeQuestion(input)).resolves.toBeNull();
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'SUCCESS' }),
    );
  });

  it('does not contact the provider after a permission change', async () => {
    const fetch = provider({ key: 'VALUES' });
    await expect(
      selectFortuneIntakeQuestion({ ...input, allowed: () => Promise.resolve(false) }),
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'FORBIDDEN',
        estimatedCostUsdMicros: 0,
      }),
    );
  });
});
