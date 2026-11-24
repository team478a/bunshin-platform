import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

type Step = {
  instruction: string;
  beforeImage: Uint8Array | null;
  afterImage: Uint8Array | null;
  detailImage: Uint8Array | null;
};

const width = 720;
const height = 1280;
const maximumOutput = 8 * 1024 * 1024;
const background = '#101828';
const ffmpeg = promisify(execFile);

function time(ms: number) {
  const seconds = Math.floor(ms / 1_000);
  return (
    [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map((value) => String(value).padStart(2, '0'))
      .join(':') +
    '.' +
    String(ms % 1000).padStart(3, '0')
  );
}

function cue(text: string, start: number, end: number) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return time(start) + ' --> ' + time(end) + '\n' + escaped + '\n\n';
}

export function materialVideoTimeline(steps: readonly Step[]) {
  if (!steps.length || steps.length > 30) throw new RangeError('invalid lesson video step count');
  let durationMs = 0;
  let captions = 'WEBVTT\n\n';
  let chapters = 'WEBVTT\n\n';
  let metadata = ';FFMETADATA1\n';
  const frames: { image: Uint8Array | null; durationMs: number }[] = [];
  for (const [index, step] of steps.entries()) {
    const instruction = step.instruction.replace(/\s+/g, ' ').trim();
    const title = '手順 ' + (index + 1);
    const start = durationMs;
    const duration = Math.max(
      4_000,
      Math.min(12_000, Math.ceil(Array.from(instruction).length / 8) * 1000),
    );
    const primary = step.afterImage ?? step.beforeImage;
    let remaining = duration;
    if (step.beforeImage && step.afterImage) {
      frames.push({ image: step.beforeImage, durationMs: 1_000 });
      remaining -= 1_000;
    }
    if (step.detailImage) {
      frames.push({ image: step.detailImage, durationMs: 1_000 });
      remaining -= 1_000;
    }
    frames.push({ image: primary, durationMs: remaining });
    durationMs += duration;
    captions += cue(instruction || title, start, durationMs);
    chapters += cue(title, start, durationMs);
    metadata += [
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      'START=' + start,
      'END=' + durationMs,
      'title=' + title,
      '',
    ].join('\n');
  }
  return { frames, captions, chapters, metadata, durationMs };
}

export async function renderMaterialVideo(steps: readonly Step[], signal: AbortSignal) {
  const { frames, captions, chapters, metadata, durationMs } = materialVideoTimeline(steps);
  const directory = await mkdtemp(join(tmpdir(), 'bunshin-lesson-video-'));
  try {
    const concat = ['ffconcat version 1.0'];
    for (const [index, frame] of frames.entries()) {
      signal.throwIfAborted();
      const file = 'frame-' + index + '.png';
      const source = frame.image
        ? sharp(frame.image, { limitInputPixels: 16_000_000 })
            .flatten({ background })
            .resize(width, height, { fit: 'contain', background })
        : sharp({ create: { width, height, channels: 3, background } });
      await source.png().toFile(join(directory, file));
      concat.push("file '" + file + "'", 'duration ' + frame.durationMs / 1000);
    }
    concat.push("file 'frame-" + (frames.length - 1) + ".png'");
    await Promise.all([
      writeFile(join(directory, 'frames.ffconcat'), concat.join('\n') + '\n'),
      writeFile(join(directory, 'captions.vtt'), captions),
      writeFile(join(directory, 'chapters.txt'), metadata),
    ]);
    await ffmpeg(
      process.env['BROWSER_FFMPEG_PATH'] || 'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-f',
        'concat',
        '-safe',
        '1',
        '-i',
        'frames.ffconcat',
        '-protocol_whitelist',
        'file',
        '-i',
        'captions.vtt',
        '-protocol_whitelist',
        'file',
        '-f',
        'ffmetadata',
        '-i',
        'chapters.txt',
        '-map',
        '0:v:0',
        '-map',
        '1:0',
        '-map_metadata',
        '2',
        '-map_chapters',
        '2',
        '-metadata:s:s:0',
        'language=jpn',
        '-c:s',
        'mov_text',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '25',
        '-maxrate',
        '160k',
        '-bufsize',
        '320k',
        '-threads',
        '2',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        'fps=12',
        '-t',
        String(durationMs / 1000),
        '-movflags',
        '+faststart',
        'lesson.mp4',
      ],
      {
        cwd: directory,
        signal,
        windowsHide: true,
        maxBuffer: 128 * 1024,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([key]) =>
            /^(PATH|SystemRoot|WINDIR|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LANG|LC_ALL)$/i.test(key),
          ),
        ),
      },
    );
    signal.throwIfAborted();
    const output = join(directory, 'lesson.mp4');
    const { size } = await stat(output);
    if (!size || size > maximumOutput) throw new RangeError('lesson video exceeds storage limits');
    return { mp4: new Uint8Array(await readFile(output)), captions, chapters, durationMs };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
