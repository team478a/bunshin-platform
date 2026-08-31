import 'server-only';
import type { VideoSceneGenerationOutputStoragePort } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'video-ai-scenes';
const MAX_BYTES = 100_000_000;
const HOSTS = new Set(['fal.media', 'v2.fal.media', 'v3.fal.media']);

function storageClient() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '動画の保存先が設定されていません');
  return createClient(url, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function allowedSourceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', '生成動画のURLが不正です');
  }
  if (
    url.protocol !== 'https:' ||
    !HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new ApplicationError('VALIDATION_ERROR', '生成動画の保存元が許可されていません');
  return url.toString();
}

async function readMp4(response: Response) {
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_BYTES)
    throw new ApplicationError('VALIDATION_ERROR', '生成動画が大きすぎます');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length < 12 ||
    bytes.length > MAX_BYTES ||
    Buffer.from(bytes.subarray(4, 8)).toString('ascii') !== 'ftyp'
  )
    throw new ApplicationError('VALIDATION_ERROR', '生成動画の形式を確認できませんでした');
  return bytes;
}

export class SupabaseFalVideoSceneOutputStorage implements VideoSceneGenerationOutputStoragePort {
  constructor(private readonly storage: SupabaseClient = storageClient()) {}

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

  async store(input: Parameters<VideoSceneGenerationOutputStoragePort['store']>[0]) {
    const response = await fetch(allowedSourceUrl(input.sourceUrl), {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', '生成動画を取得できませんでした');
    const bytes = await readMp4(response);
    await this.ensureBucket();
    const storageKey = `${input.workspaceId}/${input.ownerUserId}/${input.generationId}.mp4`;
    const uploaded = await this.storage.storage.from(BUCKET).upload(storageKey, bytes, {
      contentType: 'video/mp4',
      cacheControl: '3600',
      upsert: false,
    });
    if (uploaded.error && !/already exists/i.test(uploaded.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '生成動画を保存できませんでした');
    return { storageKey };
  }

  async createDownloadUrl(storageKey: string) {
    const signed = await this.storage.storage.from(BUCKET).createSignedUrl(storageKey, 5 * 60);
    if (signed.error)
      throw new ApplicationError('INTERNAL_ERROR', 'AI動画を開く準備ができませんでした');
    return signed.data.signedUrl;
  }
}
