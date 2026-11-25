import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NarrateMaterialStep } from './material-narration';

type AzureNarrationUsage = {
  model: string;
  characters: number;
  latencyMs: number;
  occurredAt: Date;
  success: boolean;
};

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function azureMaterialNarration(
  model: 'ja-JP-ShioriNeural' | 'ja-JP-DaichiNeural',
  record?: (usage: AzureNarrationUsage) => Promise<void>,
): NarrateMaterialStep {
  const region = process.env['BROWSER_AZURE_SPEECH_REGION']?.trim();
  const key = process.env['BROWSER_AZURE_SPEECH_KEY']?.trim();
  if (!region || !/^[a-z][a-z0-9]{1,39}$/.test(region) || !key)
    throw new Error('Azure Speech narration is not configured');
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  return async ({ text, directory, file, signal }) => {
    const occurredAt = new Date();
    const characters = Array.from(text).length;
    if (characters > 400) throw new RangeError('lesson narration text exceeds step limit');
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">` +
      `<voice name="${model}">${escapeXml(text)}</voice></speak>`;
    let success = false;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
        },
        body: ssml,
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Azure Speech narration failed (${response.status})`);
      }
      const audio = Buffer.from(await response.arrayBuffer());
      if (
        audio.length < 44 ||
        audio.toString('ascii', 0, 4) !== 'RIFF' ||
        audio.toString('ascii', 8, 12) !== 'WAVE'
      )
        throw new Error('Azure Speech returned invalid audio');
      await writeFile(join(directory, file), audio, { signal });
      success = true;
    } finally {
      await record?.({
        model,
        characters,
        latencyMs: Date.now() - occurredAt.getTime(),
        occurredAt,
        success,
      });
    }
  };
}
