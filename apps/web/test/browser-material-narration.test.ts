import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  findJob: vi.fn(),
  instruction: vi.fn(),
  synthesize: vi.fn(),
  decrypt: vi.fn(),
  record: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: 'staging' }) }));
vi.mock('@bunshin/database', () => ({
  prisma: { job: { findFirst: mocks.findJob } },
  PrismaBrowserMaterialVideos: class {
    narrationInstruction = mocks.instruction;
  },
  PrismaAiUsageEventRepository: class {
    record = mocks.record;
  },
}));
vi.mock('../src/ai/secure-provider-configuration', () => ({
  AesGcmAiProviderSecretCrypto: class {
    decrypt = mocks.decrypt;
  },
}));
vi.mock('../src/ai/azure-speech', () => ({ synthesizeAzureSpeech: mocks.synthesize }));
import { browserMaterialNarrationResponse } from '../src/http/browser-material-narration';

const jobId = '11111111-1111-4111-8111-111111111111';
const workerId = '22222222-2222-4222-8222-222222222222';
const request = (key: string) =>
  new Request('http://localhost/narration', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'x-browser-job-id': jobId,
      'x-browser-worker-id': workerId,
      'x-browser-step-ordinal': '2',
    },
    body: 'この本文は転送しない',
  });

beforeEach(() => vi.resetAllMocks());
it('verifies the worker before looking up narration data', async () => {
  vi.stubEnv('BROWSER_FIXTURE_MODEL_SECRET', 'internal-key');
  try {
    expect((await browserMaterialNarrationResponse(request('other'))).status).toBe(401);
    expect(mocks.findJob).not.toHaveBeenCalled();
    expect(mocks.synthesize).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

it('resolves the voice and text from the leased record and only responds with audio', async () => {
  vi.stubEnv('BROWSER_FIXTURE_MODEL_SECRET', 'internal-key');
  const job = {
    id: jobId,
    requestedBy: workerId,
    workspaceId: workerId,
    leaseExpiresAt: new Date(Date.now() + 30_000),
  };
  const voice = {
    region: 'japaneast',
    encryptedKey: 'encrypted',
    model: 'ja-JP-DaichiNeural',
    instruction: '表示を確認します。',
  };
  mocks.findJob.mockResolvedValue(job);
  mocks.instruction.mockResolvedValue(voice);
  mocks.decrypt.mockReturnValue('provider-test-key');
  mocks.synthesize.mockResolvedValue(new Uint8Array([1, 2, 3]));
  try {
    const response = await browserMaterialNarrationResponse(request('internal-key'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.findJob).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          environment: 'STAGING',
          status: 'LEASED',
          leaseOwner: workerId,
        }),
      }),
    );
    expect(mocks.instruction).toHaveBeenCalledWith(job, 2);
    expect(mocks.synthesize).toHaveBeenCalledWith(
      { region: voice.region, key: 'provider-test-key' },
      voice.model,
      voice.instruction,
      expect.anything(),
    );
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ model: voice.model, status: 'SUCCESS' }),
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
