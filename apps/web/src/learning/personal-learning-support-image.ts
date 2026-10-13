import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ApplicationError } from '@bunshin/shared';
import { PRACTICE_SUPPORT_IMAGE_MAX_BYTES } from '@bunshin/application';

export const PRACTICE_SUPPORT_UPLOAD_MAX_BYTES = 3_000_000;
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Decode one static learner screenshot, strip metadata, and normalize before persistence/provider use. */
export async function normalizePracticeSupportImage(value: string) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(PRACTICE_SUPPORT_UPLOAD_MAX_BYTES / 3) * 4 + 64
  )
    throw new ApplicationError('VALIDATION_ERROR', '写真のサイズを確認してください');
  const match = DATA_URL.exec(value);
  if (!match)
    throw new ApplicationError('VALIDATION_ERROR', 'JPEG・PNG・WebPの写真を選んでください');
  const source = Buffer.from(match[1]!, 'base64');
  if (
    source.length < 1 ||
    source.length > PRACTICE_SUPPORT_UPLOAD_MAX_BYTES ||
    source.toString('base64') !== match[1]
  )
    throw new ApplicationError('VALIDATION_ERROR', '写真のサイズまたは形式を確認してください');
  try {
    const image = sharp(source, { limitInputPixels: 24_000_000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
      throw new Error('unsupported image');
    const bytes = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    if (bytes.byteLength < 1 || bytes.byteLength > PRACTICE_SUPPORT_IMAGE_MAX_BYTES)
      throw new ApplicationError('VALIDATION_ERROR', '写真を小さくしてから添付してください');
    return {
      mimeType: 'image/jpeg' as const,
      base64: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
      bytes: new Uint8Array(bytes),
    };
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError('VALIDATION_ERROR', '写真を読み取れませんでした', error);
  }
}
