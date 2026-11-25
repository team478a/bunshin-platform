import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  lessonNarrationSelection,
  videoFileQuery,
  videoResponse,
} from '../src/services/browser-material-video';

it('returns private byte ranges for in-browser MP4 playback', async () => {
  const data = new Uint8Array([11, 12, 13, 14]);
  const request = (range: string) => new Request('http://localhost', { headers: { range } });
  const response = videoResponse(request('bytes=1-2'), data);
  expect(response.status).toBe(206);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-range')).toBe('bytes 1-2/4');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([12, 13]));
  expect(videoResponse(request('bytes=-2'), data).headers.get('content-range')).toBe('bytes 2-3/4');
  expect(videoResponse(request('bytes=8-'), data).status).toBe(416);
  expect(videoResponse(request('bytes=0-1,2-3'), data).status).toBe(416);
  expect(videoResponse(request('bytes=1-2'), null).status).toBe(404);
  expect(videoResponse(request(''), 'WEBVTT').headers.get('content-type')).toBe(
    'text/vtt; charset=utf-8',
  );
});

it('keeps old file URLs on version 1 and accepts explicit narration versions', () => {
  const material = '50000000-1111-4111-8111-111111111111';
  expect(videoFileQuery.parse({ material, variant: 'mp4' }).version).toBe(1);
  expect(videoFileQuery.parse({ material, variant: 'captions', version: '2' }).version).toBe(2);
  for (const version of ['3', '4', '5']) {
    expect(videoFileQuery.parse({ material, variant: 'captions', version }).version).toBe(
      Number(version),
    );
  }
  expect(videoFileQuery.safeParse({ material, variant: 'chapters', version: '6' }).success).toBe(
    false,
  );
});

it('defaults to Shiori and accepts Daichi only on eligible pilot materials', () => {
  const material = { verifiedAt: new Date(), importedAt: null };
  expect(lessonNarrationSelection(true, material, undefined)).toEqual({
    voice: 'shiori',
    version: 4,
  });
  expect(lessonNarrationSelection(true, material, 'daichi')).toEqual({
    voice: 'daichi',
    version: 5,
  });
  expect(lessonNarrationSelection(false, material, 'daichi')).toEqual({ voice: null, version: 3 });
  expect(lessonNarrationSelection(true, { ...material, importedAt: new Date() }, 'daichi')).toEqual(
    { voice: null, version: 3 },
  );
});
