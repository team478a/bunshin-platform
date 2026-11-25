import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { videoResponse } from '../src/services/browser-material-video';

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
