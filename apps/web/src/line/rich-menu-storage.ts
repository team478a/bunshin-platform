import 'server-only';
import type { LineConfigurationEnvironment } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';

const BUCKET = 'line-rich-menus';
const MAX_IMAGE_BYTES = 1_000_000;

function imageSize(bytes: Uint8Array, contentType: string) {
  if (
    contentType === 'image/png' &&
    bytes.length >= 24 &&
    Buffer.from(bytes.subarray(1, 4)).toString('ascii') === 'PNG'
  )
    return {
      width: Buffer.from(bytes).readUInt32BE(16),
      height: Buffer.from(bytes).readUInt32BE(20),
    };
  if (contentType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      )
        return {
          height: Buffer.from(bytes).readUInt16BE(offset + 5),
          width: Buffer.from(bytes).readUInt16BE(offset + 7),
        };
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = Buffer.from(bytes).readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  throw new ApplicationError('VALIDATION_ERROR', '画像ファイルを確認できません');
}

function client() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '画像保存先が設定されていません');
  return createClient(url, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class LineRichMenuStorage {
  constructor(private readonly storage = client()) {}

  private async ensureBucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) return;
    const created = await this.storage.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
    });
    if (created.error && !/already exists/i.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '画像保存先を準備できませんでした');
  }

  async upload(environment: LineConfigurationEnvironment, file: File) {
    if (
      !['image/png', 'image/jpeg'].includes(file.type) ||
      file.size < 1 ||
      file.size > MAX_IMAGE_BYTES
    )
      throw new ApplicationError('VALIDATION_ERROR', 'PNGまたはJPEGを1MB以内で選んでください');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = imageSize(bytes, file.type);
    if (size.width !== 2500 || ![843, 1686].includes(size.height))
      throw new ApplicationError('VALIDATION_ERROR', '画像サイズは2500×843または2500×1686です');
    await this.ensureBucket();
    const extension = file.type === 'image/png' ? 'png' : 'jpg';
    const objectKey = `${environment.toLowerCase()}/line-rich-menus/${randomUUID()}.${extension}`;
    const uploaded = await this.storage.storage.from(BUCKET).upload(objectKey, bytes, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    });
    if (uploaded.error) throw new ApplicationError('INTERNAL_ERROR', '画像を保存できませんでした');
    return {
      objectKey,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      contentType: file.type,
      width: size.width,
      height: size.height,
    };
  }

  async download(objectKey: string) {
    const downloaded = await this.storage.storage.from(BUCKET).download(objectKey);
    if (downloaded.error) throw new ApplicationError('NOT_FOUND', '画像が見つかりません');
    return new Uint8Array(await downloaded.data.arrayBuffer());
  }

  async remove(objectKey: string) {
    await this.storage.storage.from(BUCKET).remove([objectKey]);
  }
}
