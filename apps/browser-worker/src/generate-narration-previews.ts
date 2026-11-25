import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  browserMaterialAzureVoices,
  browserMaterialNarrationPreviewText,
} from '@bunshin/capability-browser';
import { azureMaterialNarration } from './azure-material-narration';

const output = process.argv[2];
if (!output) throw new Error('Specify the directory for the two public preview audio files');
const directory = resolve(output);
await mkdir(directory, { recursive: true });
const signal = AbortSignal.timeout(30_000);
for (const [voice, { model }] of Object.entries(browserMaterialAzureVoices)) {
  await azureMaterialNarration(model)({
    text: browserMaterialNarrationPreviewText,
    directory,
    file: `${voice}.wav`,
    signal,
  });
}
