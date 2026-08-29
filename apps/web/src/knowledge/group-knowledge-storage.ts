import 'server-only';

import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'group-knowledge';
const MAX_PDF_BYTES = 50_000_000;
const MAX_VIDEO_BYTES = 25_000_000;
const BUCKET_OPTIONS = {
  public: false,
  fileSizeLimit: MAX_PDF_BYTES,
  allowedMimeTypes: ['application/pdf', 'video/mp4', 'video/quicktime'],
};

function storageConfiguration() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  const publicKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY || !publicKey)
    throw new ApplicationError('CONFIGURATION_ERROR', 'ナレッジの保存先が設定されていません');
  return { url, publicKey, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY };
}

function storageClient() {
  const configuration = storageConfiguration();
  return {
    configuration,
    client: createClient(configuration.url, configuration.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

function detectedMimeType(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

export class SupabaseGroupKnowledgeStorage {
  private readonly storage: SupabaseClient;
  private readonly publicKey: string;

  constructor(value = storageClient()) {
    this.storage = value.client;
    this.publicKey = value.configuration.publicKey;
  }

  private async ensureBucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) {
      const updated = await this.storage.storage.updateBucket(BUCKET, BUCKET_OPTIONS);
      if (updated.error)
        throw new ApplicationError('INTERNAL_ERROR', 'ナレッジの保存上限を確認できませんでした');
      return;
    }
    const created = await this.storage.storage.createBucket(BUCKET, BUCKET_OPTIONS);
    if (created.error && !/already exists/iu.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', 'ナレッジの保存先を準備できませんでした');
  }

  async createUploadAuthorization(input: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    const max = input.mimeType === 'application/pdf' ? MAX_PDF_BYTES : MAX_VIDEO_BYTES;
    if (input.sizeBytes < 1 || input.sizeBytes > max)
      throw new ApplicationError('VALIDATION_ERROR', 'ファイルの容量が上限を超えています');
    await this.ensureBucket();
    const signed = await this.storage.storage.from(BUCKET).createSignedUploadUrl(input.storageKey, {
      upsert: false,
    });
    if (signed.error)
      throw new ApplicationError('INTERNAL_ERROR', 'アップロードを準備できませんでした');
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

  async inspectUploadedObject(input: {
    storageKey: string;
    expectedMimeType: string;
    expectedSizeBytes: number;
  }) {
    const signed = await this.storage.storage.from(BUCKET).createSignedUrl(input.storageKey, 60);
    if (signed.error)
      throw new ApplicationError('NOT_FOUND', 'アップロードしたファイルが見つかりません');
    const response = await fetch(signed.data.signedUrl, {
      headers: { range: 'bytes=0-4095' },
      cache: 'no-store',
    });
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'アップロードしたファイルを確認できません');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = detectedMimeType(bytes);
    const rangeTotal = response.headers.get('content-range')?.match(/\/(\d+)$/u)?.[1];
    const sizeBytes = Number(rangeTotal ?? response.headers.get('content-length') ?? bytes.length);
    if (mimeType !== input.expectedMimeType || sizeBytes !== input.expectedSizeBytes)
      throw new ApplicationError('VALIDATION_ERROR', '選択した種類とファイルの内容が一致しません');
    return { mimeType, sizeBytes };
  }

  async createReadUrl(storageKey: string, expiresInSeconds = 600) {
    const signed = await this.storage.storage
      .from(BUCKET)
      .createSignedUrl(storageKey, expiresInSeconds);
    if (signed.error)
      throw new ApplicationError('NOT_FOUND', 'アップロードしたファイルが見つかりません');
    return signed.data.signedUrl;
  }
}
