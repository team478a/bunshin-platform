import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import type { LearningAiRequest } from '@bunshin/application';
import { GoogleLearningGenerationAdapter } from '../src/providers/google-learning-generation';
import {
  assertLearningProviderCapabilities,
  LEARNING_LONG_CONTEXT_THRESHOLD_BYTES,
} from '../src/providers/learning-provider-capabilities';

const request: LearningAiRequest = {
  task: 'LESSON',
  provider: 'google',
  model: 'gemini-eval-model',
  modelCapabilities: ['STRUCTURED_OUTPUT'],
  serializedPrompt: JSON.stringify({
    model: 'ignored-openai-model',
    store: false,
    max_output_tokens: 400,
    input: [
      { role: 'system', content: 'Use synthetic inputs only.' },
      { role: 'user', content: 'Fictional learning request.' },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'learning_lesson',
        strict: true,
        schema: {
          type: 'object',
          properties: { status: { type: 'string' } },
          required: ['status'],
        },
      },
    },
  }),
};

describe('Google learning evaluation adapter', () => {
  it('translates the purpose request from capabilities and records measured output', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          modelVersion: 'gemini-eval-model',
          candidates: [{ content: { parts: [{ text: '{"status":"READY"}' }] } }],
          usageMetadata: { promptTokenCount: 24, candidatesTokenCount: 8 },
        }),
        { status: 200 },
      ),
    );
    const result = await new GoogleLearningGenerationAdapter(fetcher).generate(
      request,
      (value) => value as { status: string },
      { apiKey: 'test-key-never-logged' },
    );

    expect(result.value).toEqual({ status: 'READY' });
    expect(result.measurement).toMatchObject({
      provider: 'google',
      model: 'gemini-eval-model',
      inputTokens: 24,
      outputTokens: 8,
      success: true,
    });
    expect(result.requestFinished).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url instanceof URL ? url.toString() : typeof url === 'string' ? url : url.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-eval-model:generateContent',
    );
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-key-never-logged');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toMatchObject({
      systemInstruction: { parts: [{ text: 'Use synthetic inputs only.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Fictional learning request.' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 400,
        candidateCount: 1,
      },
    });
  });

  it('fails closed before network access when the configured capability is absent', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new GoogleLearningGenerationAdapter(fetcher).generate(
        { ...request, modelCapabilities: [] },
        (value) => value,
        { apiKey: 'test-key' },
      ),
    ).rejects.toThrow('STRUCTURED_OUTPUT');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires IMAGE_INPUT only when the request actually contains an image', async () => {
    const imageRequest: LearningAiRequest = {
      ...request,
      task: 'PRACTICE_SUPPORT',
      serializedPrompt: JSON.stringify({
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'synthetic' },
              { type: 'input_image', image_url: 'data:image/jpeg;base64,/9j/2Q==' },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'learning_support',
            strict: true,
            schema: { type: 'object', properties: {}, required: [] },
          },
        },
      }),
    };
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new GoogleLearningGenerationAdapter(fetcher).generate(imageRequest, (value) => value, {
        apiKey: 'test-key',
      }),
    ).rejects.toThrow('IMAGE_INPUT');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires LONG_CONTEXT based on bounded request size, never on model-name branching', () => {
    const oversized = {
      ...request,
      model: 'arbitrary-new-model-id',
      serializedPrompt: 'x'.repeat(LEARNING_LONG_CONTEXT_THRESHOLD_BYTES + 1),
    };
    expect(() => assertLearningProviderCapabilities(oversized)).toThrow('LONG_CONTEXT');
    expect(() =>
      assertLearningProviderCapabilities({
        ...oversized,
        modelCapabilities: ['STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
      }),
    ).not.toThrow();
  });
});
