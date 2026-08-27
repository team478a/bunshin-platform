import 'server-only';
import type { VideoRenderOutputStoragePort } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'video-renders';
const MAX_BYTES = 100_000_000;
const ALLOWED_SOURCE_HOST = 'cdn.creatomate.com';

function client() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '動画の保存先が設定されていません');
  return createClient(url, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sourceUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', '完成動画のURLが不正です');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== ALLOWED_SOURCE_HOST ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new ApplicationError('VALIDATION_ERROR', '完成動画のURLが許可されていません');
  return parsed.toString();
}

function isMp4(bytes: Uint8Array) {
  return bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString('ascii') === 'ftyp';
}

async function readLimited(response: Response) {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new ApplicationError('VALIDATION_ERROR', '完成動画のサイズが上限を超えています');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export class SupabaseVideoRenderOutputStorage implements VideoRenderOutputStoragePort {
  constructor(private readonly storage: SupabaseClient = client()) {}

  private async ensureBucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) return;
    const created = await this.storage.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ['video/mp4'],
    });
    if (created.error && !/already exists/i.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '動画の保存先を準備できませんでした');
  }

  async store(input: Parameters<VideoRenderOutputStoragePort['store']>[0]) {
    const response = await fetch(sourceUrl(input.sourceUrl), {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', '完成動画を取得できませんでした');
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_BYTES)
      throw new ApplicationError('VALIDATION_ERROR', '完成動画のサイズが上限を超えています');
    const bytes = await readLimited(response);
    if (!bytes.length || bytes.length > MAX_BYTES || !isMp4(bytes))
      throw new ApplicationError('VALIDATION_ERROR', '完成動画の形式を確認できませんでした');
    await this.ensureBucket();
    const storageKey = `${input.workspaceId}/${input.ownerUserId}/${input.renderId}.mp4`;
    const uploaded = await this.storage.storage.from(BUCKET).upload(storageKey, bytes, {
      contentType: 'video/mp4',
      cacheControl: '3600',
      upsert: false,
    });
    if (uploaded.error && !/already exists/i.test(uploaded.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '完成動画を保存できませんでした');
    return { storageKey };
  }

  async createDownloadUrl(storageKey: string) {
    const signed = await this.storage.storage.from(BUCKET).createSignedUrl(storageKey, 5 * 60);
    if (signed.error)
      throw new ApplicationError('INTERNAL_ERROR', '完成動画を開く準備ができませんでした');
    return signed.data.signedUrl;
  }
}
