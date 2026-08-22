import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_ENV: 'production' }),
}));

vi.mock('@bunshin/database', () => ({
  checkDatabaseReadiness: vi.fn().mockResolvedValue(undefined),
}));

import { readyResponse } from '../src/http/health';

describe('readiness check', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_key_1234567890');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('includes authentication readiness without exposing configuration', async () => {
    const response = await readyResponse(
      new Request('http://localhost/api/health/ready', {
        headers: { 'x-request-id': 'req_12345678' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ready',
      environment: 'production',
      checks: { configuration: 'ok', authentication: 'ok', database: 'ok' },
      requestId: 'req_12345678',
    });
  });

  it('fails closed when authentication is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    const response = await readyResponse(new Request('http://localhost/api/health/ready'));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'CONFIGURATION_ERROR', message: 'サービスの準備が完了していません。' },
    });
  });

  it('rejects non-HTTPS production authentication URLs', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://project.supabase.co');

    const response = await readyResponse(new Request('http://localhost/api/health/ready'));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'CONFIGURATION_ERROR' } });
  });
});
