import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const get = vi.fn();
const active = vi.fn();
const hasConfiguration = vi.fn();
vi.mock('@bunshin/database', () => ({
  PrismaLineOperationalSnapshotRepository: class {
    get = get;
  },
  PrismaAdminEmailConfigurationRepository: class {
    active = active;
    hasConfiguration = hasConfiguration;
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
  active.mockResolvedValue(null);
  hasConfiguration.mockResolvedValue(false);
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

  it('fails closed after database-managed email settings have been paused', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://app.example.com');
    vi.stubEnv('RESEND_ADMIN_ALERT_API_KEY', 'legacy-resend-api-key');
    vi.stubEnv('RESEND_ADMIN_ALERT_FROM', 'alerts@example.com');
    vi.stubEnv('RESEND_ADMIN_ALERT_TO', 'admin@example.com');
    get.mockResolvedValue({
      environment: 'PRODUCTION',
      configuration: { active: true, verified: true, globallyPaused: false },
      deliveries: { failed: 0 },
      jobs: { retryScheduled: 0, dead: 0 },
      failures: [],
    });
    hasConfiguration.mockResolvedValue(true);
    const response = await lineOperationalReadinessResponse(
      new Request('https://app.example.com/api/internal/line/readiness', {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      data: { alertingConfigured: false },
    });
  });
});
