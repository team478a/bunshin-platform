import 'server-only';
import { ApplicationError } from '@bunshin/shared';

export const NARRATION_MODEL = 'tts-1';
export const NARRATION_VOICE = 'alloy';
export const NARRATION_VERSION = 'video-narration-pcm-v1';
export const NARRATION_MICROS_PER_CHARACTER = 15;
const bytesPerMs = 48; // 24 kHz, mono, signed 16-bit PCM.

export class OpenAIVideoNarrationError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
  ) {
    super(category);
  }
}

export function narrationCharacters(text: string) {
  return Array.from(text.trim()).length;
}

export function validateNarrationScenes(scenes: Array<{ narration: string; durationMs: number }>) {
  if (!scenes.length || scenes.length > 12)
    throw new ApplicationError('VALIDATION_ERROR', '音声の場面数が不正です。');
  for (const scene of scenes) {
    const count = narrationCharacters(scene.narration);
    if (
      count === 0 ||
      !Number.isInteger(scene.durationMs) ||
      scene.durationMs < 500 ||
      scene.durationMs > 60_000 ||
      count > Math.floor((scene.durationMs / 1000) * 3)
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '音声の台本が長すぎます。企画を作り直してください。',
      );
  }
}

export async function composeNarration(
  scenes: Array<{ narration: string; durationMs: number }>,
  speak: (text: string, durationMs: number) => Promise<Uint8Array>,
) {
  validateNarrationScenes(scenes);
  const durationMs = scenes.reduce((total, scene) => total + scene.durationMs, 0);
  if (durationMs !== 30_000 && durationMs !== 60_000)
    throw new ApplicationError('VALIDATION_ERROR', '動画の長さが不正です。');
  const pcm = Buffer.alloc(durationMs * bytesPerMs);
  let offset = 0;
  for (const scene of scenes) {
    const audio = await speak(scene.narration.trim(), scene.durationMs);
    if (!audio.length || audio.length % 2 !== 0 || audio.length > scene.durationMs * bytesPerMs)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '音声が場面の時間を超えました。企画を作り直してください。',
      );
    pcm.set(audio, offset);
    offset += scene.durationMs * bytesPerMs;
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export class OpenAIVideoNarration {
  constructor(
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async speak(text: string, durationMs: number) {
    let response: Response;
    try {
      response = await this.request('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: NARRATION_MODEL,
          voice: NARRATION_VOICE,
          input: text,
          response_format: 'pcm',
          speed: 1,
        }),
      });
    } catch {
      throw new OpenAIVideoNarrationError('NETWORK', true);
    }
    if (!response.ok)
      throw new OpenAIVideoNarrationError(
        response.status === 429
          ? 'RATE_LIMIT'
          : response.status >= 500
            ? 'PROVIDER_ERROR'
            : 'INVALID_REQUEST',
        response.status === 429 || response.status >= 500,
      );
    if (!response.body) throw new OpenAIVideoNarrationError('INVALID_RESPONSE', true);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > durationMs * bytesPerMs)
          throw new ApplicationError(
            'VALIDATION_ERROR',
            '音声が場面の時間を超えました。企画を作り直してください。',
          );
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  }
}
