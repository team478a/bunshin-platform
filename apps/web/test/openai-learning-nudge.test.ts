import { describe, expect, it, vi } from 'vitest';
import { generateLearningNudge, learningNudgeBody } from '../src/providers/openai-learning-nudge';

const permit = { maxRequestBytes: 2000, maxOutputTokens: 100 };

describe('N-2 bounded learning nudge provider', () => {
  it('sends only situation, ordinal, and fixed intent; no learner text or history', () => {
    const body = JSON.parse(
      learningNudgeBody({ situation: 'STUCK', ordinal: 1, model: 'gpt-5.2', permit }),
    ) as { input: { role: string; content: string }[]; store: boolean };
    const userMessage = JSON.parse(body.input[1]!.content) as Record<string, unknown>;
    expect(body.store).toBe(false);
    expect(Object.keys(userMessage).sort()).toEqual(['fixedIntent', 'ordinal', 'situation']);
    expect(userMessage).toMatchObject({ situation: 'STUCK', ordinal: 1 });
    expect(JSON.stringify(body)).not.toMatch(/learner|profile|history|answer|conversation/i);
  });

  it('enforces the configured request-byte cap and strict bounded output', async () => {
    expect(() =>
      learningNudgeBody({
        situation: 'NO_RESPONSE',
        ordinal: 2,
        model: 'gpt-5.2',
        permit: { maxRequestBytes: 32, maxOutputTokens: 100 },
      }),
    ).toThrow('learning nudge request limit exceeded');
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        model: 'gpt-5.2',
        status: 'completed',
        usage: { input_tokens: 10, output_tokens: 5 },
        output: [
          {
            content: [
              { type: 'output_text', text: JSON.stringify({ message: '一歩だけ進めましょう。' }) },
            ],
          },
        ],
      }),
    );
    const result = await generateLearningNudge({
      apiKey: 'synthetic-test-key',
      model: 'gpt-5.2',
      modelCapabilities: ['STRUCTURED_OUTPUT'],
      body: learningNudgeBody({ situation: 'STUCK', ordinal: 1, model: 'gpt-5.2', permit }),
      fetch,
    });
    expect(result).toMatchObject({
      value: '一歩だけ進めましょう。',
      requestFinished: true,
      measurement: { success: true, provider: 'openai', model: 'gpt-5.2' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects URLs and overlong content so the caller can use fixed N-1 copy', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        model: 'gpt-5.2',
        status: 'completed',
        usage: { input_tokens: 10, output_tokens: 5 },
        output: [
          {
            content: [
              { type: 'output_text', text: JSON.stringify({ message: 'https://example.test' }) },
            ],
          },
        ],
      }),
    );
    const result = await generateLearningNudge({
      apiKey: 'synthetic-test-key',
      model: 'gpt-5.2',
      modelCapabilities: ['STRUCTURED_OUTPUT'],
      body: learningNudgeBody({ situation: 'STUCK', ordinal: 1, model: 'gpt-5.2', permit }),
      fetch,
    });
    expect(result.value).toBeNull();
    expect(result.measurement).toMatchObject({ success: false, validationResult: 'FAILED' });
  });
});
