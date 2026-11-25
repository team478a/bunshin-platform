import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  azureSpeechRegion,
  synthesizeAzureSpeech,
  verifyAzureSpeechConnection,
} from '../src/ai/azure-speech';

const connection = { region: 'japaneast', key: 'test-key' };
it('validates both narrator voices without submitting synthesis', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json([{ ShortName: 'ja-JP-ShioriNeural' }, { ShortName: 'ja-JP-DaichiNeural' }]),
    );
  vi.stubGlobal('fetch', fetch);
  try {
    await verifyAzureSpeechConnection(connection);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      'https://japaneast.tts.speech.microsoft.com/cognitiveservices/voices/list',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(azureSpeechRegion.safeParse('localhost.example/').success).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('escapes the verified step text when synthesizing the selected voice', async () => {
  const wav = Buffer.alloc(46);
  wav.write('RIFF');
  wav.write('WAVE', 8);
  const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array(wav)));
  vi.stubGlobal('fetch', fetch);
  try {
    const audio = await synthesizeAzureSpeech(
      connection,
      'ja-JP-DaichiNeural',
      '操作 <A & B>',
      new AbortController().signal,
    );
    expect(audio).toEqual(new Uint8Array(wav));
    expect(fetch).toHaveBeenCalledWith(
      'https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: expect.stringContaining(
          '<voice name="ja-JP-DaichiNeural">操作 &lt;A &amp; B&gt;</voice>',
        ),
      }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
