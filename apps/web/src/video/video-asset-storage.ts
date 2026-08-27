import 'server-only';
import type { VideoAssetStoragePort } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'video-assets';
const MAX_BYTES = 200_000_000;
const INSPECTION_BYTES = 4_000_000;

function storageConfiguration() {
  const environment = getServerEnvironment();
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL;
  const publicKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !environment.SUPABASE_SERVICE_ROLE_KEY || !publicKey)
    throw new ApplicationError('CONFIGURATION_ERROR', '素材の保存先が設定されていません');
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

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 24 || Buffer.from(bytes.subarray(1, 4)).toString('ascii') !== 'PNG')
    return null;
  return {
    width: Buffer.from(bytes).readUInt32BE(16),
    height: Buffer.from(bytes).readUInt32BE(20),
  };
}

function jpegSize(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
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
    const length = Buffer.from(bytes).readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') !== 'RIFF' ||
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') !== 'WEBP'
  )
    return null;
  const chunk = Buffer.from(bytes.subarray(12, 16)).toString('ascii');
  if (chunk === 'VP8X')
    return {
      width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
      height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
    };
  if (chunk === 'VP8 ' && bytes.length >= 30)
    return {
      width: Buffer.from(bytes).readUInt16LE(26) & 0x3fff,
      height: Buffer.from(bytes).readUInt16LE(28) & 0x3fff,
    };
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = Buffer.from(bytes).readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

function imageInspection(bytes: Uint8Array) {
  const png = pngSize(bytes);
  if (png) return { mimeType: 'image/png', ...png };
  const jpeg = jpegSize(bytes);
  if (jpeg) return { mimeType: 'image/jpeg', ...jpeg };
  const webp = webpSize(bytes);
  if (webp) return { mimeType: 'image/webp', ...webp };
  return null;
}

function videoDuration(bytes: Uint8Array) {
  const marker = Buffer.from(bytes).indexOf('mvhd');
  if (marker < 0 || marker + 24 >= bytes.length) return null;
  const buffer = Buffer.from(bytes);
  const version = bytes[marker + 4];
  const timescaleOffset = marker + (version === 1 ? 24 : 16);
  const durationOffset = timescaleOffset + 4;
  if (durationOffset + (version === 1 ? 8 : 4) > bytes.length) return null;
  const timescale = buffer.readUInt32BE(timescaleOffset);
  if (!timescale) return null;
  const duration =
    version === 1
      ? Number(buffer.readBigUInt64BE(durationOffset))
      : buffer.readUInt32BE(durationOffset);
  return Math.round((duration / timescale) * 1000);
}

function videoInspection(bytes: Uint8Array) {
  if (bytes.length < 32 || Buffer.from(bytes.subarray(4, 8)).toString('ascii') !== 'ftyp')
    return null;
  const brand = Buffer.from(bytes.subarray(8, 12)).toString('ascii');
  return {
    mimeType: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4',
    durationMs: videoDuration(bytes),
  };
}

function totalSize(response: Response, received: number) {
  const range = response.headers.get('content-range');
  const parsed = range?.match(/\/(\d+)$/)?.[1];
  return parsed ? Number(parsed) : Number(response.headers.get('content-length') ?? received);
}

export class SupabaseVideoAssetStorage implements VideoAssetStoragePort {
  private readonly storage: SupabaseClient;
  private readonly publicKey: string;

  constructor(value = storageClient()) {
    this.storage = value.client;
    this.publicKey = value.configuration.publicKey;
  }

  private async ensureBucket() {
    const found = await this.storage.storage.getBucket(BUCKET);
    if (found.data) return;
    const created = await this.storage.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
    });
    if (created.error && !/already exists/i.test(created.error.message))
      throw new ApplicationError('INTERNAL_ERROR', '素材の保存先を準備できませんでした');
  }

  async createUploadAuthorization(input: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    await this.ensureBucket();
    const signed = await this.storage.storage.from(BUCKET).createSignedUploadUrl(input.storageKey, {
      upsert: false,
    });
    if (signed.error)
      throw new ApplicationError('INTERNAL_ERROR', '素材のアップロードを準備できませんでした');
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
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };
  }

  async inspectUploadedObject(input: { storageKey: string }) {
    const signed = await this.storage.storage.from(BUCKET).createSignedUrl(input.storageKey, 60);
    if (signed.error)
      throw new ApplicationError('INTERNAL_ERROR', 'アップロードした素材を確認できませんでした');
    const response = await fetch(signed.data.signedUrl, {
      headers: { range: `bytes=0-${INSPECTION_BYTES - 1}` },
      cache: 'no-store',
    });
    if (!response.ok)
      throw new ApplicationError('INTERNAL_ERROR', 'アップロードした素材を確認できませんでした');
    const head = new Uint8Array(await response.arrayBuffer());
    const sizeBytes = totalSize(response, head.byteLength);
    const image = imageInspection(head);
    if (image)
      return {
        mimeType: image.mimeType,
        sizeBytes,
        width: image.width,
        height: image.height,
        durationMs: null,
        signatureVerified: true,
      };
    let video = videoInspection(head);
    if (video?.durationMs === null && sizeBytes > head.byteLength) {
      const tailResponse = await fetch(signed.data.signedUrl, {
        headers: { range: `bytes=${Math.max(0, sizeBytes - INSPECTION_BYTES)}-${sizeBytes - 1}` },
        cache: 'no-store',
      });
      if (tailResponse.ok) {
        const durationMs = videoDuration(new Uint8Array(await tailResponse.arrayBuffer()));
        if (durationMs !== null && video) video = { ...video, durationMs };
      }
    }
    return {
      mimeType: video?.mimeType ?? 'application/octet-stream',
      sizeBytes,
      width: null,
      height: null,
      durationMs: video?.durationMs ?? null,
      signatureVerified: Boolean(video),
    };
  }
}
