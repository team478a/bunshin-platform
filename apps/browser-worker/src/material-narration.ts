import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const videoProcess = promisify(execFile);

export function videoProcessOptions(cwd: string, signal: AbortSignal) {
  return {
    cwd,
    signal,
    windowsHide: true,
    maxBuffer: 128 * 1024,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|SystemRoot|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LANG|LC_ALL)$/i.test(key),
      ),
    ),
  };
}

export type NarrateMaterialStep = (input: {
  text: string;
  directory: string;
  file: string;
  signal: AbortSignal;
}) => Promise<void>;

export const openJTalkNarration: NarrateMaterialStep = async ({
  text,
  directory,
  file,
  signal,
}) => {
  const input = file + '.txt';
  await writeFile(join(directory, input), text + '\n', { signal });
  await videoProcess(
    process.env['BROWSER_OPEN_JTALK_PATH'] || 'open_jtalk',
    [
      '-x',
      process.env['BROWSER_OPEN_JTALK_DICTIONARY'] || '/var/lib/mecab/dic/open-jtalk/naist-jdic',
      '-m',
      process.env['BROWSER_OPEN_JTALK_VOICE'] ||
        '/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice',
      '-s',
      '24000',
      '-ow',
      file,
      input,
    ],
    videoProcessOptions(directory, signal),
  );
};

export async function narrationDurationMs(path: string, signal: AbortSignal) {
  const wav = await readFile(path, { signal });
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('lesson narration is not WAV audio');
  }
  let bytesPerSecond = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const type = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + size > wav.length) break;
    if (type === 'fmt ' && size >= 16) bytesPerSecond = wav.readUInt32LE(offset + 8);
    if (type === 'data' && bytesPerSecond && size) return Math.ceil((size * 1000) / bytesPerSecond);
    offset += size + (size % 2);
  }
  throw new Error('lesson narration WAV is empty or incomplete');
}
