import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupabaseGroupKnowledgeStorage } from '../src/knowledge/group-knowledge-storage';

function storageClient() {
  const createBucket = vi.fn().mockResolvedValue({ data: {}, error: null });
  const createSignedUploadUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/key?token=safe' },
    error: null,
  });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/key?token=safe' },
    error: null,
  });
  const client = {
    storage: {
      getBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
      createBucket,
      from: vi.fn(() => ({ createSignedUploadUrl, createSignedUrl })),
    },
  };
  return { client, createBucket, createSignedUploadUrl };
}

describe('SupabaseGroupKnowledgeStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('非公開bucketの短期署名URLだけを返す', async () => {
    const fake = storageClient();
    const storage = new SupabaseGroupKnowledgeStorage({
      client: fake.client,
      configuration: { publicKey: 'public-key' },
    } as never);
    const result = await storage.createUploadAuthorization({
      storageKey: 'workspace/group/user/source',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    });
    expect(fake.createBucket).toHaveBeenCalledWith(
      'group-knowledge',
      expect.objectContaining({ public: false, fileSizeLimit: 200_000_000 }),
    );
    expect(fake.createSignedUploadUrl).toHaveBeenCalledWith('workspace/group/user/source', {
      upsert: false,
    });
    expect(result).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/pdf' } });
  });

  it('拡張子や申告ではなくPDFの実データを確認する', async () => {
    const fake = storageClient();
    const bytes = new TextEncoder().encode('%PDF-1.7 test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 206,
          headers: { 'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}` },
        }),
      ),
    );
    const storage = new SupabaseGroupKnowledgeStorage({
      client: fake.client,
      configuration: { publicKey: 'public-key' },
    } as never);
    await expect(
      storage.inspectUploadedObject({
        storageKey: 'workspace/group/user/source',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: bytes.length,
      }),
    ).resolves.toEqual({ mimeType: 'application/pdf', sizeBytes: bytes.length });
  });

  it('申告と実データが違うファイルを拒否する', async () => {
    const fake = storageClient();
    const bytes = new Uint8Array(32);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(bytes, {
          status: 206,
          headers: { 'content-range': 'bytes 0-31/32' },
        }),
      ),
    );
    const storage = new SupabaseGroupKnowledgeStorage({
      client: fake.client,
      configuration: { publicKey: 'public-key' },
    } as never);
    await expect(
      storage.inspectUploadedObject({
        storageKey: 'workspace/group/user/source',
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: 32,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
