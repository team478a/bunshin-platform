import { describe, it, expect, vi } from 'vitest';
import {
  generateLearningLesson,
  learningLessonBody,
} from '../src/providers/openai-learning-lesson';
const wish = {
  id: 'wish',
  revision: 1,
  createdAt: '2026-10-13T00:00:00Z',
  originalText: 'AIでお店のホームページを作りたい',
  deviceType: 'PC' as const,
  toolDescription: 'AIチャット',
  experienceDescription: null,
  currentPosition: 'まだ作っていない',
};
const proposal = {
  status: 'READY',
  reason: '自分で作る練習',
  questions: [],
  outcome: '見出しを直せる',
  explanation: '希望を伝える',
  example: 'お店を紹介する',
  practice: ['本人がAIでたたき台を作り、見出しを修正する'],
  evidence: ['変更した見出し'],
  criteria: ['本人が変更理由を説明する'],
};
const body = () =>
  learningLessonBody(wish, 'gpt-5.2-2025-12-11', { maxRequestBytes: 16000, maxOutputTokens: 2000 });
const raw = (p: unknown = proposal) => ({
  status: 'completed',
  model: 'gpt-5.2-2025-12-11',
  usage: { input_tokens: 100, output_tokens: 50, input_tokens_details: { cached_tokens: 0 } },
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(p) }] }],
});
describe('lesson Provider', () => {
  it('keeps original wish, unknown experience and non-storage request', () => {
    const v = JSON.parse(body()) as {
      store: boolean;
      max_output_tokens: number;
      input: { content: string }[];
    };
    expect(v.store).toBe(false);
    expect(v.max_output_tokens).toBe(2000);
    expect(JSON.parse(v.input[1]!.content)).toMatchObject({
      originalText: wish.originalText,
      experienceDescription: null,
    });
  });
  it('passes only bounded caller-selected persona context and preserves its confidence label', () => {
    const v = JSON.parse(
      learningLessonBody(
        wish,
        'gpt-5.2-2025-12-11',
        { maxRequestBytes: 16000, maxOutputTokens: 2000 },
        false,
        [
          {
            attributeKey: 'explanation_style',
            value: '短い例を先に見る',
            epistemicStatus: 'LEARNER_CONFIRMED',
            evidenceType: 'LEARNING_REQUEST',
            evidenceCreatedAt: '2026-10-16T00:00:00.000Z',
          },
        ],
      ),
    ) as { input: { role: string; content: string }[] };
    const learnerData = JSON.parse(v.input.find((item) => item.role === 'user')!.content);
    expect(learnerData.personaContext).toEqual([
      {
        attributeKey: 'explanation_style',
        value: '短い例を先に見る',
        epistemicStatus: 'LEARNER_CONFIRMED',
        evidenceType: 'LEARNING_REQUEST',
        evidenceCreatedAt: '2026-10-16T00:00:00.000Z',
      },
    ]);
    expect(v.input.find((item) => item.role === 'system')?.content).toContain('UNCONFIRMED_GUESS');
  });
  it('drops lowest-priority persona entries before exceeding the request-byte limit', () => {
    const context = [
      {
        attributeKey: 'confirmed_priority',
        value: 'confirmed fact',
        epistemicStatus: 'LEARNER_CONFIRMED' as const,
        evidenceType: 'LEARNING_REQUEST' as const,
        evidenceCreatedAt: '2026-10-17T00:00:00.000Z',
      },
      ...Array.from({ length: 20 }, (_, index) => ({
        attributeKey: `guess_${index}`,
        value: 'x'.repeat(900),
        epistemicStatus: 'UNCONFIRMED_GUESS' as const,
        evidenceType: 'LEARNING_REQUEST' as const,
        evidenceCreatedAt: '2026-10-17T00:00:00.000Z',
      })),
    ];
    const encoded = learningLessonBody(
      wish,
      'gpt-5.2-2025-12-11',
      { maxRequestBytes: 10_000, maxOutputTokens: 2000 },
      false,
      context,
    );
    expect(Buffer.byteLength(encoded, 'utf8')).toBeLessThanOrEqual(10_000);
    const parsed = JSON.parse(encoded) as { input: { role: string; content: string }[] };
    const data = JSON.parse(parsed.input.find((item) => item.role === 'user')!.content);
    expect(data.personaContext[0].attributeKey).toBe('confirmed_priority');
    expect(data.personaContext.length).toBeLessThan(context.length);
  });
  it('rejects byte overflow and unsupported models before fetch', () => {
    expect(() =>
      learningLessonBody(wish, 'gpt-5.2', { maxRequestBytes: 1, maxOutputTokens: 2000 }),
    ).toThrow();
    expect(() =>
      learningLessonBody(wish, 'unknown', { maxRequestBytes: 16000, maxOutputTokens: 2000 }),
    ).toThrow();
  });
  it('records successful structured generation usage', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(raw()));
    const r = await generateLearningLesson({
      apiKey: 'synthetic',
      model: 'gpt-5.2-2025-12-11',
      body: body(),
      fetch: fetcher,
    });
    expect(r.value).toEqual(proposal);
    expect(r.measurement).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 0,
      success: true,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('keeps cost measurements when proposal is invalid', async () => {
    const r = await generateLearningLesson({
      apiKey: 'synthetic',
      model: 'gpt-5.2-2025-12-11',
      body: body(),
      fetch: vi.fn().mockResolvedValue(Response.json(raw({ ...proposal, skills: {} }))),
    });
    expect(r.value).toBeNull();
    expect(r.measurement).toMatchObject({
      success: false,
      inputTokens: 100,
      validationResult: 'FAILED',
    });
  });
  it('does not turn missing usage into zero', async () => {
    const r = await generateLearningLesson({
      apiKey: 'synthetic',
      model: 'gpt-5.2-2025-12-11',
      body: body(),
      fetch: vi.fn().mockResolvedValue(Response.json({ ...raw(), usage: null })),
    });
    expect(r.measurement.inputTokens).toBeNull();
  });
  it('does not accept incomplete output as completed teaching', async () => {
    const r = await generateLearningLesson({
      apiKey: 'synthetic',
      model: 'gpt-5.2-2025-12-11',
      body: body(),
      fetch: vi.fn().mockResolvedValue(Response.json({ ...raw(), status: 'incomplete' })),
    });
    expect(r.value).toBeNull();
  });
  it('retains reservations for a nonterminal response', async () => {
    const r = await generateLearningLesson({
      apiKey: 'synthetic',
      model: 'gpt-5.2-2025-12-11',
      body: body(),
      fetch: vi.fn().mockResolvedValue(Response.json({ ...raw(), status: 'in_progress' })),
    });
    expect(r.value).toBeNull();
    expect(r.requestFinished).toBe(false);
  });
});
