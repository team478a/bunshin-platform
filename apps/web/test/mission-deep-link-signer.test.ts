import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { HkdfMissionDeepLinkSigner } from '../src/line/mission-deep-link-signer';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('ENCRYPTION_KEY', 'encryption-root-at-least-thirty-two-bytes');
  vi.stubEnv('LINE_DEEP_LINK_KEY_VERSION', '2');
});

describe('Mission deep link signer', () => {
  it('authenticates an opaque, purpose-separated token without resource details', async () => {
    const signer = new HkdfMissionDeepLinkSigner();
    const claims = {
      stateId: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
      environment: 'DEVELOPMENT' as const,
      keyVersion: 2,
      expiresAtEpochSeconds: 1_787_372_200,
    };
    const token = await signer.sign(claims);
    expect(token).not.toContain('mission-a');
    expect(token).not.toContain('user-a');
    await expect(signer.verify(token)).resolves.toEqual(claims);
  });

  it('rejects tampering and a token from another environment key', async () => {
    const signer = new HkdfMissionDeepLinkSigner();
    const token = await signer.sign({
      stateId: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
      environment: 'DEVELOPMENT',
      keyVersion: 2,
      expiresAtEpochSeconds: 1_787_372_200,
    });
    await expect(signer.verify(`${token.slice(0, -1)}A`)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'https://staging.example.com');
    await expect(signer.verify(token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('accepts only the current and immediately previous rotation version', async () => {
    vi.stubEnv('LINE_DEEP_LINK_KEY_VERSION', '1');
    const signer = new HkdfMissionDeepLinkSigner();
    const oldToken = await signer.sign({
      stateId: '77d8baef-d7de-48d7-975e-c7c0ea4c81bf',
      environment: 'DEVELOPMENT',
      keyVersion: 1,
      expiresAtEpochSeconds: 1_787_372_200,
    });
    vi.stubEnv('LINE_DEEP_LINK_KEY_VERSION', '2');
    await expect(signer.verify(oldToken)).resolves.toMatchObject({ keyVersion: 1 });
    vi.stubEnv('LINE_DEEP_LINK_KEY_VERSION', '3');
    await expect(signer.verify(oldToken)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
