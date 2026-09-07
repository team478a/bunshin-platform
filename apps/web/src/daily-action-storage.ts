import 'server-only';

import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'daily-action-materials';
const MAX_PHOTO_BYTES = 20_000_000;
const MAX_AUDIO_BYTES = 10_000_000;

function client() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', '本人素材の保存先が設定されていません');
  return createClient(url, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function detectedMimeType(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  if (
    bytes.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  if (
    bytes.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  )
    return 'audio/wav';
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return 'audio/mpeg';
  if (bytes.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
  throw new ApplicationError(
    'VALIDATION_ERROR',
    'JPEG、PNG、WebPの写真、またはMP3、M4A、WAVの音声を選んでください',
  );
}

const extension: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
};

export class DailyActionStorage {
  constructor(private readonly storage = client()) {}

  private async ensureBucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) return;
    const created = await this.storage.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: Object.keys(extension),
    });
    if (created.error && !/already exists/iu.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '本人素材の保存先を準備できませんでした');
  }

  async upload(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    idempotencyKey: string;
    kind: 'PHOTO' | 'VOICE_MEMO';
    file: File;
  }) {
    const maximum = input.kind === 'PHOTO' ? MAX_PHOTO_BYTES : MAX_AUDIO_BYTES;
    if (input.file.size < 1 || input.file.size > maximum)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        input.kind === 'PHOTO'
          ? '写真は20MB以内で選んでください'
          : '音声は10MB以内で選んでください',
      );
    const originalFilename = input.file.name.trim();
    if (
      !originalFilename ||
      originalFilename.length > 255 ||
      /[\\/]/u.test(originalFilename) ||
      [...originalFilename].some((character) => character.charCodeAt(0) < 32)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'ファイル名を確認してください');
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const mimeType = detectedMimeType(bytes);
    if (
      (input.kind === 'PHOTO' && !mimeType.startsWith('image/')) ||
      (input.kind === 'VOICE_MEMO' && !mimeType.startsWith('audio/'))
    )
      throw new ApplicationError('VALIDATION_ERROR', '選んだ素材の種類とファイルが一致しません');
    const declaredAliases: Record<string, string[]> = {
      'audio/mp4': ['audio/mp4', 'audio/x-m4a'],
      'audio/mpeg': ['audio/mpeg', 'audio/mp3'],
      'audio/wav': ['audio/wav', 'audio/wave', 'audio/x-wav'],
    };
    if (
      input.file.type &&
      input.file.type !== mimeType &&
      !(declaredAliases[mimeType] ?? []).includes(input.file.type)
    )
      throw new ApplicationError('VALIDATION_ERROR', '選んだ素材の種類を確認できません');
    await this.ensureBucket();
    const storageKey = `${input.workspaceId}/${input.actorUserId}/${input.bunshinId}/${input.idempotencyKey}.${extension[mimeType]}`;
    const uploaded = await this.storage.storage.from(BUCKET).upload(storageKey, bytes, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    });
    if (uploaded.error)
      throw new ApplicationError('CONFLICT', '同じ本人素材はすでに受け付けています');
    return { storageKey, mimeType, originalFilename, sizeBytes: bytes.length };
  }

  async remove(storageKey: string) {
    await this.storage.storage.from(BUCKET).remove([storageKey]);
  }

  async download(storageKey: string) {
    const result = await this.storage.storage.from(BUCKET).download(storageKey);
    if (result.error) throw new ApplicationError('NOT_FOUND', '本人素材が見つかりません');
    return new Uint8Array(await result.data.arrayBuffer());
  }
}
