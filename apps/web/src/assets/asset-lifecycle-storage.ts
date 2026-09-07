import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type AssetLifecycleBucket =
  | 'social-image-media'
  | 'video-assets'
  | 'video-renders'
  | 'video-ai-scenes'
  | 'video-narrations'
  | 'daily-action-materials';

const buckets = new Set<AssetLifecycleBucket>([
  'social-image-media',
  'video-assets',
  'video-renders',
  'video-ai-scenes',
  'video-narrations',
  'daily-action-materials',
]);

function client() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', 'ファイル保存先が設定されていません');
  return createClient(url, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeKey(value: string) {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith('/') &&
    !value.includes('..') &&
    !/[\r\n]/.test(value)
  );
}

export class SupabaseAssetLifecycleStorage {
  constructor(private readonly storage: SupabaseClient = client()) {}

  async remove(input: { bucket: AssetLifecycleBucket; keys: string[] }) {
    const keys = [...new Set(input.keys)];
    if (!buckets.has(input.bucket) || keys.length === 0 || keys.length > 3 || !keys.every(safeKey))
      throw new ApplicationError('VALIDATION_ERROR', '削除対象のファイルが不正です');
    const result = await this.storage.storage.from(input.bucket).remove(keys);
    // A queued/failed render may never have created its bucket or output.
    // Already absent objects are a successful, idempotent deletion.
    if (result.error && result.error.status !== 404 && result.error.statusCode !== '404')
      throw new ApplicationError('INTERNAL_ERROR', '期限切れファイルを削除できませんでした');
  }
}
