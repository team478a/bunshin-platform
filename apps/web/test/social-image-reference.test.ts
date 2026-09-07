import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { normalizeImageReference } from '../src/social-image-reference';
import { SupabaseSocialImageStorage } from '../src/social-image-storage';

const scope = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  ownerUserId: '33333333-3333-4333-8333-333333333333',
  requestId: '44444444-4444-4444-8444-444444444444',
};
const photo = () =>
  sharp({ create: { width: 80, height: 60, channels: 3, background: 'red' } })
    .withMetadata()
    .jpeg()
    .toBuffer();

describe('reference photographs', () => {
  it('decodes the photograph, strips metadata and hashes the normalized PNG', async () => {
    const result = await normalizeImageReference((await photo()).toString('base64'));
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.exif).toBeUndefined();
    expect(result.referenceImage.sha256).toBe(
      createHash('sha256').update(result.bytes).digest('hex'),
    );
  });
  it.each(['a'.repeat(4_000_001), Buffer.from('<svg></svg>').toString('base64'), 'not an image'])(
    'rejects invalid or oversized input',
    async (value) => {
      await expect(normalizeImageReference(value)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    },
  );
  it('reads only the exact request/owner storage path and rejects changed bytes', async () => {
    const normalized = await normalizeImageReference((await photo()).toString('base64'));
    const download = vi
      .fn()
      .mockResolvedValue({ data: new Blob([new Uint8Array(normalized.bytes)]), error: null });
    const from = vi.fn(() => ({ download }));
    const storage = new SupabaseSocialImageStorage({ storage: { from } } as never);
    await expect(
      storage.readReference({ ...scope, sha256: normalized.referenceImage.sha256 }),
    ).resolves.toEqual(new Uint8Array(normalized.bytes));
    expect(download).toHaveBeenCalledWith(
      `${Object.values(scope).join('/')}/${scope.requestId}/reference.png`,
    );
    await expect(storage.readReference({ ...scope, sha256: '0'.repeat(64) })).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' },
    );
    await expect(
      storage.readReference({
        ...scope,
        ownerUserId: '../other',
        sha256: normalized.referenceImage.sha256,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
