import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { browserMaterialAzureVoices } from '@bunshin/capability-browser';
import { z } from 'zod';

export const azureSpeechRegion = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9]{1,39}$/);
export const azureSpeechKey = z
  .string()
  .trim()
  .min(8)
  .max(256)
  .regex(/^[\x21-\x7e]+$/);
export type AzureSpeechConnection = { region: string; key: string };
type SpeechModel =
  (typeof browserMaterialAzureVoices)[keyof typeof browserMaterialAzureVoices]['model'];

function speechEndpoint(connection: AzureSpeechConnection, path: string) {
  return `https://${azureSpeechRegion.parse(connection.region)}.tts.speech.microsoft.com/cognitiveservices/${path}`;
}

export async function verifyAzureSpeechConnection(connection: AzureSpeechConnection) {
  const response = await fetch(speechEndpoint(connection, 'voices/list'), {
    headers: { 'Ocp-Apim-Subscription-Key': connection.key },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'speech connection unavailable');
  }
  const voices = z.array(z.object({ ShortName: z.string() })).parse(await response.json());
  if (
    !Object.values(browserMaterialAzureVoices).every(({ model }) =>
      voices.some(({ ShortName }) => model === ShortName),
    )
  )
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'speech voice unavailable');
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function synthesizeAzureSpeech(
  connection: AzureSpeechConnection,
  model: SpeechModel,
  text: string,
  signal: AbortSignal,
) {
  if (!text || Array.from(text).length > 400)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid narration text');
  const response = await fetch(speechEndpoint(connection, 'v1'), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': connection.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
    },
    body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP"><voice name="${model}">${escapeXml(text)}</voice></speak>`,
    redirect: 'error',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'speech synthesis unavailable');
  }
  const wav = await response.arrayBuffer();
  const audio = Buffer.from(wav);
  if (
    audio.length < 44 ||
    audio.length > 4 * 1024 * 1024 ||
    audio.toString('ascii', 0, 4) !== 'RIFF' ||
    audio.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'invalid speech audio');
  return new Uint8Array(wav);
}
