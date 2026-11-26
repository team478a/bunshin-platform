import { z } from 'zod';

const mora = z.looseObject({
  text: z.string(),
  consonant_length: z.number().nullable().optional(),
  vowel_length: z.number(),
});
const querySchema = z.looseObject({
  speedScale: z.number().positive(),
  prePhonemeLength: z.number().nonnegative(),
  outputStereo: z.boolean(),
  accent_phrases: z.array(z.looseObject({ moras: z.array(mora), pause_mora: mora.nullish() })),
});
type VoiceQuery = z.infer<typeof querySchema>;

export function normalizeDialogueCue(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/gu, (letter) => String.fromCharCode(letter.charCodeAt(0) + 0x60))
    .replace(/([オコゴソゾトドノホボポモヨロヲォョ])[ウオ]/gu, '$1ー')
    .replace(/([ウクグスズツヅヌフブプムユルゥュ])ウ/gu, '$1ー')
    .replace(/([エケゲセゼテデネヘベペメレェ])[イエ]/gu, '$1ー');
}

export function dialogueMoraStarts(query: VoiceQuery) {
  const timing: Record<string, { seconds: number; source: 'aligned' }> = {};
  const moras = query.accent_phrases.flatMap(({ moras, pause_mora }) =>
    pause_mora ? [...moras, pause_mora] : moras,
  );
  const tokens = moras.map(({ text }) => normalizeDialogueCue(text));
  // VOICEVOX quantizes phonemes in frames of 256 samples at 24 kHz.
  const framesPerSecond = 93.75;
  const speed = Math.fround(query.speedScale);
  const frames = (seconds: number) =>
    Math.round(Math.fround(Math.round(Math.fround(seconds * framesPerSecond)) / speed));
  let offset = frames(query.prePhonemeLength);
  for (const [index, unit] of moras.entries()) {
    let phrase = '';
    for (const token of tokens.slice(index)) {
      if (!/^[ァ-ヿー]+$/u.test(token) || phrase.length + token.length > 24) break;
      phrase += token;
      timing[normalizeDialogueCue(phrase)] ??= {
        seconds: offset / framesPerSecond,
        source: 'aligned',
      };
    }
    offset += frames(unit.consonant_length ?? 0) + frames(unit.vowel_length);
  }
  return timing;
}

function endpoint(base: string, path: string) {
  const origin = new URL(base);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw new Error('Invalid VOICEVOX origin');
  return new URL(path, origin);
}

export async function dialogueVoices(base: string, signal: AbortSignal) {
  const response = await fetch(endpoint(base, '/speakers'), {
    signal,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error('VOICEVOX speakers unavailable');
  const voices = z
    .array(
      z.object({
        name: z.string(),
        styles: z.array(
          z.object({ id: z.number().int(), name: z.string(), type: z.string().optional() }),
        ),
      }),
    )
    .parse(await response.json());
  return voices.flatMap(({ name, styles }) =>
    styles
      .filter(({ type }) => !type || type === 'talk')
      .map(({ id, name: style }) => ({ id, name: name + '（' + style + '）' })),
  );
}

export async function dialogueVoiceWav(
  base: string,
  text: string,
  voiceId: number,
  signal: AbortSignal,
) {
  const queryUrl = endpoint(base, '/audio_query');
  queryUrl.search = new URLSearchParams({ speaker: String(voiceId), text }).toString();
  const queryResponse = await fetch(queryUrl, { method: 'POST', signal, redirect: 'error' });
  if (!queryResponse.ok) throw new Error('VOICEVOX audio query failed');
  const query = querySchema.parse(await queryResponse.json());
  const tuned = { ...query, speedScale: 0.94, outputStereo: false };
  const synthUrl = endpoint(base, '/synthesis');
  synthUrl.searchParams.set('speaker', String(voiceId));
  const response = await fetch(synthUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tuned),
    signal,
    redirect: 'error',
  });
  if (!response.ok) throw new Error('VOICEVOX synthesis failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 8_000_000 || bytes.toString('ascii', 0, 4) !== 'RIFF')
    throw new Error('VOICEVOX returned an invalid WAV');
  return { bytes, cues: dialogueMoraStarts(tuned) };
}
