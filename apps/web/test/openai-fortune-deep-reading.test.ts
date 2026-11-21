import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FortuneAiGenerationClaim } from '@bunshin/capability-fortune';
import {
  FORTUNE_DEEP_READING_PROMPT_VERSION,
  OpenAiFortuneReadingGenerator,
} from '../src/providers/openai-fortune-reading-generator';

const usage = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  reserveOpenAiRuntimeConfiguration: () =>
    Promise.resolve({ model: 'synthetic-model', apiKey: 'synthetic-key' }),
}));
vi.mock('../src/organization-ai-generation-quota', () => ({
  withOrganizationAiGenerationQuota: (input: { generate(): Promise<unknown> }) => input.generate(),
}));
vi.mock('../src/ai/openai-cost-admission', () => ({ recordOpenAiUsageAndSettle: usage }));
vi.mock('../src/fortune/personal-profile', () => ({
  fortunePersonalProfileRepository: () =>
    Promise.resolve({ read: () => Promise.resolve({ enabled: true }) }),
}));

const claim: FortuneAiGenerationClaim = {
  workspaceId: 'workspace',
  groupId: 'service',
  bunshinId: 'bunshin',
  reading: {
    id: 'reading',
    localDate: '2026-11-21',
    theme: 'WORK',
    cardCode: 'THE_FOOL',
    cardNameJa: '愚者',
    orientation: 'REVERSED',
    status: 'GENERATING',
    title: '標準の解釈',
    body: '一歩進める前に足元を確かめる。',
    actionStep: '考えていることを書き出す。',
    feedbackRating: null,
    feedbackIssue: null,
    createdAt: new Date(),
  },
  personalGuidance: true,
  reflectionEnabled: true,
  reviewedUnderstanding: [
    { field: 'VALUES', state: 'CONFIRMED', source: 'CORRECTION', text: '家族との時間' },
  ],
};
const body = '今の働き方を振り返ることから始められそうです。';
const step = '今の働き方で変えたい条件を一つ書き出しましょう。';
const proposal = {
  alternatives: ['予定を見直せるか確かめる', '別の働き方で重視する条件を考える'],
  actionReason: '家族との時間を確保するために優先順位を考えられます。',
};
const reflectionPrompt = '条件を書いてみて、重視することは変わりましたか？';

function stub(output: object) {
  const request = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    Response.json({
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
      usage: { input_tokens: 80, output_tokens: 60 },
    }),
  );
  vi.stubGlobal('fetch', request);
  return request;
}

describe('OpenAI deep Fortune generation', () => {
  beforeEach(() => {
    usage.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the original card, approved text and current reviewed values with the deep output schema', async () => {
    const provider = stub({ body, actionStep: step, deep: proposal, reflectionPrompt });
    const result = await new OpenAiFortuneReadingGenerator().generate({
      serviceSlug: 'fortune',
      actorUserId: 'user',
      claim,
    });
    const payload = JSON.parse(String(provider.mock.calls[0]?.[1]?.body)) as {
      input: Array<{ role: string; content: string }>;
      text: { format: { name: string; schema: { required: string[] } } };
    };
    expect(payload.text.format).toMatchObject({
      name: 'fortune_deep_reading',
      schema: { required: ['body', 'actionStep', 'reflectionPrompt', 'deep'] },
    });
    const context: unknown = JSON.parse(
      payload.input.find(({ role }) => role === 'user')?.content ?? '{}',
    );
    expect(context).toMatchObject({
      card: '愚者',
      orientation: 'REVERSED',
      approvedBasic: { body: claim.reading.body },
      reviewedUnderstanding: [{ field: 'VALUES', text: '家族との時間' }],
    });
    expect(result).toMatchObject({
      deep: proposal,
      reflectionPrompt,
      promptVersion: FORTUNE_DEEP_READING_PROMPT_VERSION,
    });
    expect(usage).toHaveBeenCalledOnce();
  });

  it('rejects missing or unsafe structured proposals for the existing fallback path', async () => {
    const make = () =>
      new OpenAiFortuneReadingGenerator().generate({
        serviceSlug: 'fortune',
        actorUserId: 'user',
        claim,
      });
    stub({ body, actionStep: step, reflectionPrompt });
    await expect(make()).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
    stub({
      body,
      actionStep: step,
      reflectionPrompt,
      deep: { ...proposal, alternatives: ['絶対に成功する'] },
    });
    await expect(make()).rejects.toMatchObject({ code: 'CONTENT_REJECTED' });
  });
});
