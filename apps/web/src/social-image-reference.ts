import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ApplicationError } from '@bunshin/shared';

export async function normalizeImageReference(encoded: string) {
  if (encoded.length > 4_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new ApplicationError(
      'VALIDATION_ERROR',
      '写真は3MB以下のJPEG・PNG・WebPを選んでください',
    );
  try {
    const source = Buffer.from(encoded, 'base64');
    const image = sharp(source, { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
      throw new Error('invalid image');
    // Decode fully, apply orientation and discard EXIF/location metadata.
    const bytes = await image
      .rotate()
      .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return {
      bytes,
      referenceImage: {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        rightsConfirmed: true as const,
      },
    };
  } catch {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      '写真を読み込めません。JPEG・PNG・WebPを選んでください',
    );
  }
}
