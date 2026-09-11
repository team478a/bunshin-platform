import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp, { type Metadata } from 'sharp';

const BUCKET = 'daily-action-materials';
const MAX_BYTES = 10_000_000;

function configuration() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  const publicKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !publicKey || !environment.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '写真の保存先が設定されていません');
  return { url, publicKey, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY };
}

function client() {
  const value = configuration();
  return {
    publicKey: value.publicKey,
    storage: createClient(value.url, value.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export class DailyActionStorage {
  private readonly storage: SupabaseClient;
  private readonly publicKey: string;

  constructor(value = client()) {
    this.storage = value.storage;
    this.publicKey = value.publicKey;
  }

  private async ensureBucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) return;
    const created = await this.storage.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
    if (created.error && !/already exists/i.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '写真の保存先を準備できませんでした');
  }

  async createUploadAuthorization(input: { storageKey: string; mimeType: string }) {
    await this.ensureBucket();
    const signed = await this.storage.storage.from(BUCKET).createSignedUploadUrl(input.storageKey, {
      upsert: false,
    });
    if (signed.error)
      throw new ApplicationError('INTERNAL_ERROR', '写真のアップロードを準備できませんでした');
    return {
      method: 'PUT' as const,
      uploadUrl: signed.data.signedUrl,
      headers: {
        apikey: this.publicKey,
        authorization: `Bearer ${this.publicKey}`,
        'content-type': input.mimeType,
        'cache-control': 'max-age=3600',
        'x-upsert': 'false',
      },
    };
  }

  async verifyAndNormalize(storageKey: string) {
    const bucket = this.storage.storage.from(BUCKET);
    const downloaded = await bucket.download(storageKey);
    if (downloaded.error)
      throw new ApplicationError('INTERNAL_ERROR', '保存した写真を確認できませんでした');
    const source = Buffer.from(await downloaded.data.arrayBuffer());
    if (source.byteLength < 1 || source.byteLength > MAX_BYTES)
      throw new ApplicationError('VALIDATION_ERROR', '写真は10MB以下にしてください');
    let output: Buffer;
    let metadata: Metadata;
    try {
      const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
      metadata = await image.metadata();
      output = await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    } catch (error) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'JPEG・PNG・WebPの写真を選んでください',
        error,
      );
    }
    if (!metadata.width || !metadata.height)
      throw new ApplicationError('VALIDATION_ERROR', '写真の大きさを確認できませんでした');
    const replaced = await bucket.update(storageKey, output, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });
    if (replaced.error)
      throw new ApplicationError('INTERNAL_ERROR', '写真を安全な形式で保存できませんでした');
    return {
      mimeType: 'image/jpeg',
      sizeBytes: output.byteLength,
      width: metadata.autoOrient.width ?? metadata.width,
      height: metadata.autoOrient.height ?? metadata.height,
    };
  }

  async createReadUrl(storageKey: string) {
    const signed = await this.storage.storage.from(BUCKET).createSignedUrl(storageKey, 5 * 60);
    if (signed.error) throw new ApplicationError('NOT_FOUND', '写真を開けませんでした');
    return signed.data.signedUrl;
  }

  async remove(storageKey: string) {
    const removed = await this.storage.storage.from(BUCKET).remove([storageKey]);
    if (removed.error) throw new ApplicationError('INTERNAL_ERROR', '写真を削除できませんでした');
  }
}

export const DAILY_ACTION_PHOTO_MAX_BYTES = MAX_BYTES;
