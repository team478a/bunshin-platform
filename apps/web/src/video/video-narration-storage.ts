import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';

function storageClient() {
  const env = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? env.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '音声の保存先が設定されていません。');
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export class SupabaseVideoNarrationStorage {
  constructor(private readonly client: SupabaseClient = storageClient()) {}
  async store(key: string, audio: Uint8Array) {
    const bucket = await this.client.storage.getBucket('video-narrations');
    if (!bucket.data) {
      const created = await this.client.storage.createBucket('video-narrations', {
        public: false,
        fileSizeLimit: 4_000_000,
        allowedMimeTypes: ['audio/wav'],
      });
      if (created.error && !/already exists/i.test(created.error.message))
        throw new ApplicationError('INTERNAL_ERROR', '音声の保存先を準備できませんでした。');
    }
    const result = await this.client.storage
      .from('video-narrations')
      .upload(key, audio, { contentType: 'audio/wav', upsert: true });
    if (result.error) throw new ApplicationError('INTERNAL_ERROR', '音声を保存できませんでした。');
  }
  async createUrl(key: string) {
    const result = await this.client.storage.from('video-narrations').createSignedUrl(key, 3600);
    if (result.error) throw new ApplicationError('INTERNAL_ERROR', '音声を読み込めませんでした。');
    return result.data.signedUrl;
  }
}
