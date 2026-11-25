import 'server-only';
import { z } from 'zod';

export const videoFileQuery = z.object({
  material: z.uuid(),
  variant: z.enum(['mp4', 'captions', 'chapters']),
  version: z
    .enum(['1', '2', '3'])
    .optional()
    .transform((value) => Number(value ?? '1')),
  topicId: z.uuid().optional(),
});

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
export const missingVideo = () => new Response(null, { status: 404, headers });

function byteRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  const startText = match?.[1];
  const endText = match?.[2];
  if (!startText && !endText) return null;
  const start = startText ? Number(startText) : Math.max(0, size - Number(endText));
  const end = startText && endText ? Math.min(Number(endText), size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    (endText && !Number.isSafeInteger(Number(endText))) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    return null;
  return { start, end };
}

export function videoResponse(request: Request, asset: string | Uint8Array | null) {
  if (asset === null) return missingVideo();
  if (typeof asset === 'string') {
    return new Response(asset, {
      headers: { ...headers, 'content-type': 'text/vtt; charset=utf-8' },
    });
  }
  const videoHeaders = { ...headers, 'content-type': 'video/mp4', 'accept-ranges': 'bytes' };
  const range = request.headers.get('range');
  if (!range)
    return new Response(new Uint8Array(asset), {
      headers: { ...videoHeaders, 'content-length': String(asset.byteLength) },
    });
  const interval = byteRange(range, asset.byteLength);
  if (!interval)
    return new Response(null, {
      status: 416,
      headers: { ...videoHeaders, 'content-range': 'bytes */' + asset.byteLength },
    });
  const { start, end } = interval;
  return new Response(new Uint8Array(asset.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...videoHeaders,
      'content-range': 'bytes ' + start + '-' + end + '/' + asset.byteLength,
      'content-length': String(end - start + 1),
    },
  });
}
