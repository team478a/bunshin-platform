import 'server-only';
import type { SocialImageStorageObjectKind, SocialImageStoragePort } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const BUCKET = 'social-image-media';
const MAX_SOURCE_BYTES = 20_000_000;
const MAX_RENDERED_BYTES = 15_000_000;
const READ_SECONDS = 5 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function client() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '画像の保存先が設定されていません');
  return createClient(url, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const extension = (mimeType: 'image/png' | 'image/jpeg' | 'image/webp') =>
  mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);

function scope(input: {
  workspaceId: string;
  groupId: string;
  ownerUserId: string;
  requestId: string;
  mediaId: string;
}) {
  const values = [
    input.workspaceId,
    input.groupId,
    input.ownerUserId,
    input.requestId,
    input.mediaId,
  ];
  if (!values.every((value) => UUID.test(value)))
    throw new ApplicationError('VALIDATION_ERROR', '画像の保存範囲が不正です');
  return values.join('/');
}

function key(
  input: Parameters<typeof scope>[0],
  kind: SocialImageStorageObjectKind,
  sourceMimeType?: 'image/png' | 'image/jpeg' | 'image/webp',
) {
  const prefix = scope(input);
  if (kind === 'SOURCE') {
    if (!sourceMimeType)
      throw new ApplicationError('VALIDATION_ERROR', '元画像の形式が指定されていません');
    return `${prefix}/source.${extension(sourceMimeType)}`;
  }
  return `${prefix}/${kind === 'COMPLETED' ? 'completed' : 'thumbnail'}.png`;
}

async function assertBytes(
  bytes: Uint8Array,
  max: number,
  mimeType: string,
  dimensions?: { width: number; height: number },
) {
  if (!bytes.length || bytes.byteLength > max)
    throw new ApplicationError('VALIDATION_ERROR', '画像のサイズが許可範囲外です');
  const png =
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const webp =
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP';
  if (
    (mimeType === 'image/png' && !png) ||
    (mimeType === 'image/jpeg' && !jpeg) ||
    (mimeType === 'image/webp' && !webp)
  )
    throw new ApplicationError('VALIDATION_ERROR', '画像の実形式と指定形式が一致しません');
  try {
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height)
      throw new ApplicationError('VALIDATION_ERROR', '画像の寸法を確認できません');
    if (
      dimensions &&
      (metadata.width !== dimensions.width || metadata.height !== dimensions.height)
    )
      throw new ApplicationError('VALIDATION_ERROR', '完成画像の寸法が許可されていません');
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError('VALIDATION_ERROR', '画像の内容を確認できません');
  }
}

export class SupabaseSocialImageStorage implements SocialImageStoragePort {
  constructor(private readonly storage: SupabaseClient = client()) {}

  private async ensureBucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) return;
    const created = await this.storage.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_SOURCE_BYTES,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (created.error && !/already exists/i.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '画像の保存先を準備できませんでした');
  }

  async store(input: Parameters<SocialImageStoragePort['store']>[0]) {
    await assertBytes(input.completed, MAX_RENDERED_BYTES, 'image/png', {
      width: 1080,
      height: 1350,
    });
    await assertBytes(input.thumbnail, MAX_RENDERED_BYTES, 'image/png');
    if (input.source)
      await assertBytes(input.source.bytes, MAX_SOURCE_BYTES, input.source.mimeType);
    await this.ensureBucket();
    const objects = [
      ...(input.source
        ? [
            {
              storageKey: key(input, 'SOURCE', input.source.mimeType),
              bytes: input.source.bytes,
              mimeType: input.source.mimeType,
            },
          ]
        : []),
      { storageKey: key(input, 'COMPLETED'), bytes: input.completed, mimeType: 'image/png' },
      { storageKey: key(input, 'THUMBNAIL'), bytes: input.thumbnail, mimeType: 'image/png' },
    ];
    const uploaded: string[] = [];
    try {
      for (const object of objects) {
        const result = await this.storage.storage
          .from(BUCKET)
          .upload(object.storageKey, object.bytes, {
            contentType: object.mimeType,
            cacheControl: '3600',
            upsert: false,
          });
        if (result.error)
          throw new ApplicationError('INTERNAL_ERROR', '画像を保存できませんでした');
        uploaded.push(object.storageKey);
      }
    } catch (error) {
      if (uploaded.length) await this.storage.storage.from(BUCKET).remove(uploaded);
      throw error;
    }
    return {
      sourceStorageKey: input.source ? key(input, 'SOURCE', input.source.mimeType) : null,
      completedStorageKey: key(input, 'COMPLETED'),
      thumbnailStorageKey: key(input, 'THUMBNAIL'),
      contentHash: createHash('sha256').update(input.completed).digest('hex'),
    };
  }

  async createReadUrl(input: Parameters<SocialImageStoragePort['createReadUrl']>[0]) {
    const storageKey = key(input, input.kind, input.sourceMimeType);
    const signed = await this.storage.storage
      .from(BUCKET)
      .createSignedUrl(storageKey, READ_SECONDS);
    if (signed.error)
      throw new ApplicationError('INTERNAL_ERROR', '画像を開く準備ができませんでした');
    return { url: signed.data.signedUrl, expiresAt: new Date(Date.now() + READ_SECONDS * 1000) };
  }

  async remove(input: Parameters<SocialImageStoragePort['remove']>[0]) {
    const keys = [key(input, 'COMPLETED'), key(input, 'THUMBNAIL')];
    if (input.sourceMimeType) keys.push(key(input, 'SOURCE', input.sourceMimeType));
    const removed = await this.storage.storage.from(BUCKET).remove(keys);
    if (removed.error) throw new ApplicationError('INTERNAL_ERROR', '画像を削除できませんでした');
  }
}
