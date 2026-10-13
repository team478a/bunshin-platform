import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  normalizePracticeSupportImage,
  PRACTICE_SUPPORT_UPLOAD_MAX_BYTES,
} from '../src/learning/personal-learning-support-image';

describe('practice support screenshot normalization', () => {
  it('reencodes an allowed image to a small metadata-free JPEG', async () => {
    const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#789abc' } })
      .png()
      .toBuffer();
    const result = await normalizePracticeSupportImage(
      `data:image/png;base64,${png.toString('base64')}`,
    );
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.sizeBytes).toBe(result.bytes.byteLength);
    expect(result.sizeBytes).toBeLessThanOrEqual(512_000);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({ format: 'jpeg' });
  });

  it('rejects non-image, oversized, non-canonical, and animated input', async () => {
    await expect(
      normalizePracticeSupportImage('data:text/plain;base64,SGVsbG8='),
    ).rejects.toThrow();
    const tooLarge = Buffer.alloc(PRACTICE_SUPPORT_UPLOAD_MAX_BYTES + 1);
    await expect(
      normalizePracticeSupportImage(`data:image/jpeg;base64,${tooLarge.toString('base64')}`),
    ).rejects.toThrow();
    await expect(normalizePracticeSupportImage('data:image/png;base64,%%%')).rejects.toThrow();
  });
});
