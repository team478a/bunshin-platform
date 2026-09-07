import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  composeNarration,
  NARRATION_MICROS_PER_CHARACTER,
  narrationCharacters,
  OpenAIVideoNarration,
  validateNarrationScenes,
} from '../src/providers/openai-video-narration';

describe('OpenAI video narration', () => {
  it('builds a fixed-duration 24 kHz mono WAV and leaves scene silence intact', async () => {
    const speak = vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4]));
    const wav = await composeNarration(
      [
        { narration: '最初', durationMs: 15_000 },
        { narration: '次', durationMs: 15_000 },
      ],
      speak,
    );
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.length).toBe(44 + 30_000 * 48);
    expect(wav.subarray(44, 48)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(wav.subarray(44 + 15_000 * 48, 48 + 15_000 * 48)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('rejects narration beyond the three-character-per-second budget before billing', () => {
    expect(() =>
      validateNarrationScenes([{ narration: 'あ'.repeat(31), durationMs: 10_000 }]),
    ).toThrow('台本が長すぎます');
  });

  it('counts Unicode characters and records the published character price unit', () => {
    expect(narrationCharacters(' 企業🚀 ')).toBe(3);
    expect(NARRATION_MICROS_PER_CHARACTER).toBe(15);
  });

  it('requests raw PCM without exposing the API key in the body', async () => {
    const request = vi.fn().mockResolvedValue(new Response(Uint8Array.from([1, 2])));
    const speech = new OpenAIVideoNarration('secret-key', request);
    await expect(speech.speak('案内', 1_000)).resolves.toEqual(Buffer.from([1, 2]));
    const init = request.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ authorization: 'Bearer secret-key' });
    expect(init.body).toBe(
      JSON.stringify({
        model: 'tts-1',
        voice: 'alloy',
        input: '案内',
        response_format: 'pcm',
        speed: 1,
      }),
    );
    expect(init.body).not.toContain('secret-key');
  });

  it.each([
    [400, 'INVALID_REQUEST', false],
    [429, 'RATE_LIMIT', true],
    [500, 'PROVIDER_ERROR', true],
  ])(
    'classifies provider status %i for bounded job retries',
    async (status, category, retryable) => {
      const speech = new OpenAIVideoNarration(
        'secret-key',
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      await expect(speech.speak('案内', 1_000)).rejects.toMatchObject({ category, retryable });
    },
  );
});
