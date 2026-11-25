import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { materialVideoTimeline, renderMaterialVideo } from '../src/material-video';

const blank = { instruction: '確認する', beforeImage: null, afterImage: null, detailImage: null };

it('keeps captions and chapters aligned and limits rendered steps', () => {
  const detailImage = new Uint8Array([1]);
  const result = materialVideoTimeline([
    { ...blank, instruction: 'ボタン <確認> を押す', detailImage },
    blank,
  ]);
  expect(result.frames.map(({ durationMs }) => durationMs)).toEqual([1000, 3000, 4000]);
  expect(result.captions).toContain('00:00:04.000 --> 00:00:08.000');
  expect(result.captions).toContain('&lt;確認&gt;');
  expect(result.chapters).toContain('手順 2');
  expect(result.metadata).toContain('START=4000\nEND=8000');
  expect(() => materialVideoTimeline([])).toThrow(RangeError);
  const narrated = materialVideoTimeline([blank, blank], [4901, 900]);
  expect(narrated.stepDurationsMs).toEqual([5250, 4000]);
  expect(narrated.captions).toContain('00:00:05.250 --> 00:00:09.250');
  expect(narrated.metadata).toContain('CC BY 3.0');
});

it.skipIf(process.env['BROWSER_VIDEO_LIVE_TESTS'] !== '1')(
  'renders an MP4 with installed FFmpeg',
  async () => {
    const source = process.env['BROWSER_VIDEO_SAMPLE_IMAGE'];
    const image = source ? new Uint8Array(await readFile(source)) : null;
    const { mp4, captions, durationMs } = await renderMaterialVideo(
      [
        { ...blank, instruction: '入力画面を開く' },
        { ...blank, afterImage: image, instruction: '練習用メモのプレビューを確認する' },
      ],
      AbortSignal.timeout(60_000),
    );
    expect(Buffer.from(mp4.subarray(4, 8)).toString()).toBe('ftyp');
    expect(durationMs).toBe(8000);
    expect(captions).toContain('練習用メモのプレビュー');
    const output = process.env['BROWSER_VIDEO_SAMPLE_OUTPUT'];
    const directory = mkdtempSync(join(tmpdir(), 'bunshin-video-test-'));
    try {
      const sample = join(directory, 'sample.mp4');
      writeFileSync(sample, mp4);
      const streams = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_name,width,height:format=duration:chapter=start_time,end_time:chapter_tags=title',
          '-of',
          'compact',
          sample,
        ],
        { encoding: 'utf8' },
      );
      expect(streams).toContain('codec_name=h264|width=720|height=1280');
      expect(streams).toContain('codec_name=mov_text');
      expect(streams).toContain('start_time=4.000000|end_time=8.000000');
      expect(streams).toContain('tag:title=手順 2');
      expect(streams).toContain('duration=8.000000');
      if (output) await writeFile(output, mp4);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  65_000,
);

it.skipIf(process.env['BROWSER_VIDEO_LIVE_TESTS'] !== '1')(
  'adds Japanese AAC and lets longer narration extend the chapter',
  async () => {
    const pcm = Buffer.alloc(44 + (4_800 * 8_000 * 2) / 1_000);
    pcm.write('RIFF');
    pcm.writeUInt32LE(pcm.length - 8, 4);
    pcm.write('WAVEfmt ', 8);
    pcm.writeUInt32LE(16, 16);
    pcm.writeUInt16LE(1, 20);
    pcm.writeUInt16LE(1, 22);
    pcm.writeUInt32LE(8_000, 24);
    pcm.writeUInt32LE(16_000, 28);
    pcm.writeUInt16LE(2, 32);
    pcm.writeUInt16LE(16, 34);
    pcm.write('data', 36);
    pcm.writeUInt32LE(pcm.length - 44, 40);
    const directory = mkdtempSync(join(tmpdir(), 'bunshin-video-audio-test-'));
    try {
      const video = await renderMaterialVideo(
        [blank, blank],
        AbortSignal.timeout(60_000),
        async ({ text, directory, file }) => {
          expect(text).toBe(blank.instruction);
          await writeFile(join(directory, file), pcm);
        },
      );
      expect(video.durationMs).toBe(10_500);
      const sample = join(directory, 'narrated.mp4');
      await writeFile(sample, video.mp4);
      const probe = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'a:0',
          '-show_entries',
          'stream=codec_name,duration:stream_tags=language:chapter=start_time,end_time',
          '-of',
          'compact',
          sample,
        ],
        { encoding: 'utf8' },
      );
      expect(probe).toContain('codec_name=aac|duration=10.500000|tag:language=jpn');
      expect(probe).toContain('start_time=5.250000|end_time=10.500000');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  65_000,
);
