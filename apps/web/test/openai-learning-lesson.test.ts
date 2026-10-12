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
