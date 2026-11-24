import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ actor: vi.fn(), save: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'http://localhost' }),
}));
vi.mock('../src/services/browser-materials', () => ({
  browserMaterialActor: mocks.actor,
  saveMimikMaterial: mocks.save,
}));

import { POST } from '../app/api/browser-materials/[workspaceId]/import/route';
import { InvalidMimikRecording, parseMimikMaterial } from '../src/services/mimik-material-import';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const actor = { workspaceId, actorId: '22222222-2222-4222-8222-222222222222' };
const manifest = {
  version: 1,
  exportedAt: 1764000000000,
  guide: { title: 'メモを作成', description: 'secure@example.test の練習記録' },
  redacted: { screenshots: true, inputValues: true, urls: 'path' },
  steps: [
    {
      id: 'shot-step',
      index: 1,
      description: 'プレビューを押す',
      url: 'https://example.test/secret',
    },
    { id: 'heading', index: 0, description: '準備', blockType: 'heading' },
  ],
  screenshots: [
    { id: 'shot', stepId: 'shot-step', file: 'screenshots/shot.webp', mimeType: 'image/webp' },
  ],
};

async function archive(input: unknown = manifest) {
  const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#def' } })
    .webp()
    .toBuffer();
  return Buffer.from(
    zipSync({
      'manifest.json': strToU8(JSON.stringify(input)),
      'README.md': strToU8('練習記録'),
      'screenshots/shot.webp': webp,
    }),
  );
}

async function upload(bytes: Buffer, origin = 'http://localhost') {
  return POST(
    new Request('http://localhost/api/browser-materials/' + workspaceId + '/import', {
      method: 'POST',
      body: new Uint8Array(bytes),
      headers: {
        origin,
        'content-type': 'application/octet-stream',
        'x-mimik-device': 'mobile',
        'x-mimik-reviewed': 'true',
      },
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

describe('Mimik Desktop v1.2.0 bundle v1', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue(actor);
    mocks.save.mockResolvedValue({ id: 'material' });
  });

  it('orders text and image steps, retains only teaching content, and ignores the packaging timestamp', async () => {
    const result = await parseMimikMaterial(await archive());
    expect(result.title).toBe('メモを作成');
    expect(result.goal).toBe('[メールアドレス] の練習記録');
    expect(result.steps[0]).toEqual({
      ordinal: 1,
      stepId: 'heading',
      instruction: '準備',
      afterImage: null,
    });
    expect(result.steps[1]?.instruction).toBe('プレビューを押す');
    expect((await sharp(result.steps[1]?.afterImage ?? Buffer.alloc(0)).metadata()).format).toBe(
      'webp',
    );
    expect(JSON.stringify(result)).not.toContain('https://example.test');
    expect(
      (await parseMimikMaterial(await archive({ ...manifest, exportedAt: 0 }))).importDigest,
    ).toBe(result.importDigest);
  });

  it.each([
    { ...manifest, version: 2 },
    { ...manifest, redacted: { ...manifest.redacted, inputValues: false } },
    {
      ...manifest,
      screenshots: [{ ...manifest.screenshots[0], file: 'screenshots/missing.webp' }],
    },
  ])(
    'rejects archives with an unsupported format, privacy setting or missing image',
    async (input) => {
      await expect(parseMimikMaterial(await archive(input))).rejects.toBeInstanceOf(
        InvalidMimikRecording,
      );
    },
  );

  it('checks origin and membership before passing a valid recording to private storage', async () => {
    const bytes = await archive();
    expect((await upload(bytes, 'http://other.invalid')).status).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValueOnce(null);
    expect((await upload(bytes)).status).toBe(404);
    expect(mocks.save).not.toHaveBeenCalled();
    const result = await upload(bytes);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.save).toHaveBeenCalledWith(
      actor,
      'mobile',
      expect.objectContaining({ title: 'メモを作成' }),
    );
  });
});
