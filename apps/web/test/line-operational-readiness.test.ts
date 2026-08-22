import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const get = vi.fn();
vi.mock('@bunshin/database', () => ({
  PrismaLineOperationalSnapshotRepository: class {
    get = get;
  },
}));

import { lineOperationalReadinessResponse } from '../src/http/line-operational-readiness';

const secret = 'cron-secret-at-least-thirty-two-bytes';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('CRON_SECRET', secret);
  get.mockResolvedValue({
    environment: 'DEVELOPMENT',
    configuration: { active: true, verified: true, globallyPaused: false },
    deliveries: { failed: 0 },
    jobs: { retryScheduled: 0, dead: 0 },
    failures: [],
  });
});

describe('LINE operational readiness HTTP boundary', () => {
  it('requires the server-side cron secret', async () => {
    const response = await lineOperationalReadinessResponse(
      new Request('http://localhost/api/internal/line/readiness'),
    );
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it('derives the environment on the server and returns aggregate state only', async () => {
    const response = await lineOperationalReadinessResponse(
      new Request('http://localhost/api/internal/line/readiness?environment=PRODUCTION', {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        environment: 'DEVELOPMENT',
        ready: true,
        alertingConfigured: false,
        alerts: [],
      },
    });
    expect(get).toHaveBeenCalledWith('DEVELOPMENT');
  });

  it('returns service unavailable when a critical condition exists', async () => {
    get.mockResolvedValue({
      environment: 'DEVELOPMENT',
      configuration: { active: false, verified: false, globallyPaused: false },
      deliveries: { failed: 0 },
      jobs: { retryScheduled: 0, dead: 0 },
      failures: [],
    });
    const response = await lineOperationalReadinessResponse(
      new Request('http://localhost/api/internal/line/readiness', {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('ACTIVE_CONFIGURATION_MISSING');
    expect(body).not.toContain(secret);
  });
});
