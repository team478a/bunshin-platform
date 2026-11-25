import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { browserMaterialAzureVoices } from '@bunshin/capability-browser';
import { azureMaterialNarration } from '../src/azure-material-narration';

it('uses the selected Azure voice and escapes lesson text inside SSML', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bunshin-azure-test-'));
  const wav = Buffer.alloc(46);
  wav.write('RIFF');
  wav.write('WAVE', 8);
  const fetch = vi.fn(
    async (_url: string, _options: RequestInit) => new Response(new Uint8Array(wav)),
  );
  const record = vi.fn(async () => {});
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('BROWSER_AZURE_SPEECH_REGION', 'japaneast');
  vi.stubEnv('BROWSER_AZURE_SPEECH_KEY', 'test-key');
  try {
    for (const [voice, profile] of Object.entries(browserMaterialAzureVoices)) {
      await azureMaterialNarration(
        profile.model,
        record,
      )({
        text: '「A & B <次へ>」を選びます。',
        directory,
        file: `${voice}.wav`,
        signal: new AbortController().signal,
      });
      expect(await readFile(join(directory, `${voice}.wav`))).toEqual(wav);
      const [endpoint, request] = fetch.mock.lastCall!;
      expect(endpoint).toBe('https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1');
      expect(request.redirect).toBe('error');
      expect(request.body).toContain(`<voice name="${profile.model}">`);
      expect(request.body).toContain('A &amp; B &lt;次へ&gt;');
      expect(record).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: profile.model, success: true }),
      );
    }
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
