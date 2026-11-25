import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { browserMaterialNarration } from '../src/azure-material-narration';

it('requests only the leased job and step from the web worker endpoint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bunshin-speech-worker-'));
  const audio = new Uint8Array([1, 2, 3]);
  const fetch = vi
    .fn<(url: URL, request: RequestInit) => Promise<Response>>()
    .mockImplementation(() => Promise.resolve(new Response(audio)));
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('BROWSER_FIXTURE_MODEL_ORIGIN', 'https://stage.example');
  vi.stubEnv('BROWSER_FIXTURE_MODEL_SECRET', 'worker-secret');
  try {
    const narrate = browserMaterialNarration('job-id', 'worker-id');
    const signal = new AbortController().signal;
    for (const step of [1, 2]) {
      const file = `${step}.wav`;
      await narrate({ text: '教材の本文', directory, file, signal });
      const [url, request] = fetch.mock.lastCall!;
      expect(url.href).toBe('https://stage.example/api/internal/browser-fixture/narration');
      expect(request.headers).toMatchObject({
        'x-browser-job-id': 'job-id',
        'x-browser-worker-id': 'worker-id',
        'x-browser-step-ordinal': String(step),
      });
      expect(request.body).toBeUndefined();
      expect(await readFile(join(directory, file))).toEqual(Buffer.from(audio));
    }
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
