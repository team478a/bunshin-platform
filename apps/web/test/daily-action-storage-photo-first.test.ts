import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));

import { DailyActionStorage } from '../src/daily-actions/daily-action-storage';

describe('DailyActionStorage Photo First preparation', () => {
  it('downloads a private photo and re-encodes it within the Vision size boundary', async () => {
    const source = await sharp({
      create: {
        width: 2400,
        height: 1800,
        channels: 3,
        background: { r: 20, g: 80, b: 140 },
      },
    })
      .png()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const download = vi.fn().mockResolvedValue({ data: new Blob([source]), error: null });
    const storage = {
      storage: {
        from: vi.fn(() => ({ download })),
      },
    };

    const prepared = await new DailyActionStorage({
      publicKey: 'test',
      storage: storage as never,
    }).readForVision('workspace/user/photo.png');

    expect(download).toHaveBeenCalledWith('workspace/user/photo.png');
    expect(prepared.mimeType).toBe('image/jpeg');
    const metadata = await sharp(prepared.bytes).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.format).toBe('jpeg');
  });
});
