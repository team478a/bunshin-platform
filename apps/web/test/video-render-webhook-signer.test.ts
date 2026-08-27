import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { HkdfVideoRenderWebhookSigner } from '../src/video/video-render-webhook-signer';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const renderId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
  vi.stubEnv('VIDEO_RENDER_WEBHOOK_KEY_VERSION', '2');
});

describe('video render webhook signer', () => {
  it('creates an environment-bound, expiring callback URL', async () => {
    const signer = new HkdfVideoRenderWebhookSigner(() => new Date('2026-08-27T00:00:00Z'), 60);
    const url = new URL(await signer.createUrl({ workspaceId, renderId }));
    expect(url.origin).toBe('http://localhost:3000');
    const state = url.searchParams.get('state')!;
    expect(signer.verify(state)).toMatchObject({ workspaceId, renderId, keyVersion: 2 });
    const expired = new HkdfVideoRenderWebhookSigner(() => new Date('2026-08-27T00:01:01Z'), 60);
    expect(() => expired.verify(state)).toThrow('invalid video render webhook state');
  });

  it('rejects tampering and a token from another environment', async () => {
    const signer = new HkdfVideoRenderWebhookSigner();
    const state = new URL(await signer.createUrl({ workspaceId, renderId })).searchParams.get(
      'state',
    )!;
    expect(() => signer.verify(`${state.slice(0, -1)}A`)).toThrow();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('APP_URL', 'https://staging.example.com');
    expect(() => signer.verify(state)).toThrow();
  });
});
