import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
const BUCKET = 'ai-character-references';
const MAX = 20_000_000;
function client() {
  const env = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? env.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '画像保存先が設定されていません');
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function actualType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  throw new ApplicationError('VALIDATION_ERROR', 'JPEG、PNG、WebPの画像を選んでください');
}
export class AiCharacterReferenceStorage {
  constructor(private readonly storage = client()) {}
  private async bucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) return;
    const created = await this.storage.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
    if (created.error && !/already exists/i.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '画像保存先を準備できませんでした');
  }
  async upload(input: { workspaceId: string; groupId: string; versionId: string; file: File }) {
    if (input.file.size < 1 || input.file.size > MAX)
      throw new ApplicationError('VALIDATION_ERROR', '画像は20MB以内で選んでください');
    const originalFilename = input.file.name.trim();
    const hasControlCharacter = [...originalFilename].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
    if (
      !originalFilename ||
      originalFilename.length > 255 ||
      originalFilename.includes('/') ||
      originalFilename.includes('\\') ||
      hasControlCharacter
    )
      throw new ApplicationError('VALIDATION_ERROR', '画像のファイル名を確認してください');
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const mimeType = actualType(bytes);
    if (input.file.type && input.file.type !== mimeType)
      throw new ApplicationError('VALIDATION_ERROR', '画像の種類を確認できません');
    await this.bucket();
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const storageKey = `${input.workspaceId}/${input.groupId}/${input.versionId}/${randomUUID()}.${ext}`;
    const uploaded = await this.storage.storage
      .from(BUCKET)
      .upload(storageKey, bytes, { contentType: mimeType, upsert: false, cacheControl: '3600' });
    if (uploaded.error) throw new ApplicationError('INTERNAL_ERROR', '画像を保存できませんでした');
    return {
      storageKey,
      originalFilename,
      mimeType,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  async download(key: string) {
    const value = await this.storage.storage.from(BUCKET).download(key);
    if (value.error) throw new ApplicationError('NOT_FOUND', '画像が見つかりません');
    return new Uint8Array(await value.data.arrayBuffer());
  }
  /**
   * A provider receives a temporary read URL rather than a public object URL. The URL is
   * deliberately short-lived because reference images can identify a character or person.
   */
  async createTemporaryReadUrl(input: { storageKey: string; expiresInSeconds?: number }) {
    const storageKey = input.storageKey.trim();
    const expiresInSeconds = input.expiresInSeconds ?? 5 * 60;
    if (
      !storageKey ||
      storageKey.length > 512 ||
      storageKey.startsWith('/') ||
      storageKey.includes('..') ||
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 60 ||
      expiresInSeconds > 15 * 60
    )
      throw new ApplicationError('VALIDATION_ERROR', '画像参照URLを準備できませんでした');
    const signed = await this.storage.storage
      .from(BUCKET)
      .createSignedUrl(storageKey, expiresInSeconds);
    if (signed.error) throw new ApplicationError('NOT_FOUND', '画像参照URLを準備できませんでした');
    const url = new URL(signed.data.signedUrl);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new ApplicationError('INTERNAL_ERROR', '画像参照URLを準備できませんでした');
    return { url: url.toString(), expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  }
  async remove(key: string) {
    await this.storage.storage.from(BUCKET).remove([key]);
  }
}
