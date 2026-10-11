import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const listStaleAdmissionsForAlert = vi.fn();
const recordStaleAdmissionAlert = vi.fn();
const active = vi.fn();
const hasConfiguration = vi.fn();
vi.mock('@bunshin/database', () => ({
  PrismaAiProviderConfigurationRepository: class {
    listStaleAdmissionsForAlert = listStaleAdmissionsForAlert;
    recordStaleAdmissionAlert = recordStaleAdmissionAlert;
  },
  PrismaAdminEmailConfigurationRepository: class {
    active = active;
    hasConfiguration = hasConfiguration;
  },
}));

import { aiProviderCostMonitorResponse } from '../src/http/ai-provider-cost-monitor';

const secret = 'cron-secret-at-least-thirty-two-bytes';
const admissionId = '11111111-1111-4111-8111-111111111111';
const stale = {
  admissionIds: [admissionId],
  summaries: [
    {
      provider: 'OPENAI',
      openCount: 1,
      reservedCostUsdMicros: 250,
      oldestAdmittedAt: new Date('2026-10-11T10:00:00.000Z'),
    },
  ],
  truncated: false,
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('CRON_SECRET', secret);
  active.mockResolvedValue(null);
  hasConfiguration.mockResolvedValue(false);
  listStaleAdmissionsForAlert.mockResolvedValue({
    admissionIds: [],
    summaries: [],
    truncated: false,
  });
  recordStaleAdmissionAlert.mockResolvedValue(1);
});

const request = (authorized = true) =>
  new Request('http://localhost/api/internal/ai-provider-cost/monitor', {
    headers: authorized ? { authorization: `Bearer ${secret}` } : {},
  });

describe('AI provider cost monitor HTTP boundary', () => {
  it('rejects an unauthenticated request before reading reservations', async () => {
    const response = await aiProviderCostMonitorResponse(request(false));
    expect(response.status).toBe(401);
    expect(listStaleAdmissionsForAlert).not.toHaveBeenCalled();
  });

  it('returns a safe empty development snapshot without an alert provider', async () => {
    const response = await aiProviderCostMonitorResponse(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        environment: 'DEVELOPMENT',
        staleAdmissionCount: 0,
        reservedCostUsdMicros: 0,
        notified: false,
        alertingConfigured: false,
      },
    });
  });

  it('fails closed and leaves stale reservations pending without alert configuration', async () => {
    listStaleAdmissionsForAlert.mockResolvedValue(stale);
    const response = await aiProviderCostMonitorResponse(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      data: { staleAdmissionCount: 1, notified: false, alertingConfigured: false },
    });
    expect(recordStaleAdmissionAlert).not.toHaveBeenCalled();
  });

  it('sends aggregate-only mail and records the successful notification', async () => {
    vi.stubEnv('RESEND_ADMIN_ALERT_API_KEY', 'resend-api-key-for-test');
    vi.stubEnv('RESEND_ADMIN_ALERT_FROM', 'alerts@example.com');
    vi.stubEnv('RESEND_ADMIN_ALERT_TO', 'admin@example.com');
    listStaleAdmissionsForAlert.mockResolvedValue(stale);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetch);

    const response = await aiProviderCostMonitorResponse(request());

    expect(response.status).toBe(200);
    expect(recordStaleAdmissionAlert).toHaveBeenCalledWith(
      expect.objectContaining({ admissionIds: [admissionId], environment: 'DEVELOPMENT' }),
    );
    const options = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(typeof options.body).toBe('string');
    const body = typeof options.body === 'string' ? options.body : '';
    expect(body).toContain('OPENAI');
    expect(body).toContain('1件');
    expect(body).not.toContain(admissionId);
    expect(options.headers).toMatchObject({
      'idempotency-key': expect.stringMatching(/^ai-cost-DEVELOPMENT-[a-f0-9]{8}$/),
    });
  });

  it('does not mark reservations alerted when the mail provider fails', async () => {
    vi.stubEnv('RESEND_ADMIN_ALERT_API_KEY', 'resend-api-key-for-test');
    vi.stubEnv('RESEND_ADMIN_ALERT_FROM', 'alerts@example.com');
    vi.stubEnv('RESEND_ADMIN_ALERT_TO', 'admin@example.com');
    listStaleAdmissionsForAlert.mockResolvedValue(stale);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const response = await aiProviderCostMonitorResponse(request());

    expect(response.status).toBe(500);
    expect(recordStaleAdmissionAlert).not.toHaveBeenCalled();
  });
});
