import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  environment: {
    APP_ENV: 'production',
    OPS_DIGEST_ENABLED: 'false',
    CRON_SECRET: 'c'.repeat(32),
    APP_URL: 'https://app.example.test/',
    RESEND_ADMIN_ALERT_API_KEY: undefined as string | undefined,
    RESEND_ADMIN_ALERT_FROM: undefined as string | undefined,
    RESEND_ADMIN_ALERT_TO: undefined as string | undefined,
  },
  runState: vi.fn(),
  claim: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  deliveryStatus: vi.fn(),
  platformAdminFindFirst: vi.fn(),
  broadcasts: vi.fn(),
  invoices: vi.fn(),
  activeEmail: vi.fn(),
  hasEmailConfig: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => state.environment }));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
  requestIdFromHeader: () => 'request-test',
}));
vi.mock('@bunshin/application', () => ({
  GetAdminAlerts: class {
    execute() {
      return { alerts: [], generatedAt: new Date() };
    }
  },
  buildOpsMorningDigest: () => ({
    status: 'NO_ISSUES',
    criticalCount: 0,
    warningCount: 0,
    subject: 'safe subject',
    body: 'safe body',
  }),
  opsMorningDigestDateWindow: () => ({
    targetDate: '2026-10-19',
    from: new Date('2026-10-18T15:00:00.000Z'),
    to: new Date('2026-10-19T15:00:00.000Z'),
  }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaOpsMorningDigestRunRepository: class {
    runState = state.runState;
    claim = state.claim;
    markSent = state.markSent;
    markFailed = state.markFailed;
    deliveryStatus = state.deliveryStatus;
  },
  PrismaOpsMorningDigestCollector: class {
    serviceLineBroadcasts = state.broadcasts;
    tenantInvoiceStatuses = state.invoices;
  },
  PrismaAdminAlertRepository: class {},
  PrismaAdminEmailConfigurationRepository: class {
    active = state.activeEmail;
    hasConfiguration = state.hasEmailConfig;
  },
  prisma: { platformAdmin: { findFirst: state.platformAdminFindFirst } },
}));
vi.mock('../src/email/secure-admin-email-configuration', () => ({
  currentAdminEmailEnvironment: () => 'PRODUCTION',
  AesGcmAdminEmailSecretCrypto: class {
    decrypt = vi.fn(() => 'decrypted-key');
  },
}));
vi.mock('../src/email/ops-morning-digest-resend', () => ({
  OpsMorningDigestResend: class {
    send = state.send;
  },
  OpsMorningDigestSendError: class extends Error {
    category = 'EMAIL_PROVIDER_FAILED';
  },
}));

import { opsMorningDigestCronResponse } from '../src/http/ops-morning-digest';

const request = (authorization = `Bearer ${'c'.repeat(32)}`) =>
  new Request('https://app.example.test/api/internal/ops/morning-digest', {
    headers: { authorization },
  });

describe('morning digest cron HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state.environment, {
      APP_ENV: 'production',
      OPS_DIGEST_ENABLED: 'false',
      CRON_SECRET: 'c'.repeat(32),
      APP_URL: 'https://app.example.test/',
      RESEND_ADMIN_ALERT_API_KEY: undefined,
      RESEND_ADMIN_ALERT_FROM: undefined,
      RESEND_ADMIN_ALERT_TO: undefined,
    });
    state.runState.mockResolvedValue(null);
    state.claim.mockResolvedValue({ id: 'run-1', attemptCount: 1 });
    state.markSent.mockResolvedValue(true);
    state.markFailed.mockResolvedValue(true);
    state.deliveryStatus.mockResolvedValue('BEFORE_HISTORY');
    state.platformAdminFindFirst.mockResolvedValue({ userId: 'admin-1' });
    state.broadcasts.mockResolvedValue({
      serviceBroadcasts: { status: 'OK', value: [] },
      fortuneWeeklyBroadcasts: {
        status: 'NOT_APPLICABLE',
        reason: 'NO_SCHEDULED_FORTUNE_DELIVERY',
      },
      missingBroadcastDateCount: { status: 'OK', value: 0 },
    });
    state.invoices.mockResolvedValue({ status: 'OK', value: [] });
    state.activeEmail.mockResolvedValue(null);
    state.hasEmailConfig.mockResolvedValue(false);
    state.send.mockResolvedValue(undefined);
  });

  it('does no database scan, claim, or send when disabled or outside production', async () => {
    const disabled = await opsMorningDigestCronResponse(request());
    expect(disabled.status).toBe(200);
    expect(await disabled.json()).toMatchObject({ outcome: 'DISABLED' });
    expect(state.claim).not.toHaveBeenCalled();

    state.environment.OPS_DIGEST_ENABLED = 'true';
    state.environment.APP_ENV = 'staging';
    const staging = await opsMorningDigestCronResponse(request());
    expect(await staging.json()).toMatchObject({ outcome: 'NON_PRODUCTION_DISABLED' });
    expect(state.claim).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });

  it('authenticates with CRON_SECRET before checking or sending', async () => {
    state.environment.OPS_DIGEST_ENABLED = 'true';
    const result = await opsMorningDigestCronResponse(request('Bearer wrong-secret'));
    expect(result.status).toBe(401);
    expect(state.claim).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });

  it('uses the existing email setting and records one successful send per day', async () => {
    state.environment.OPS_DIGEST_ENABLED = 'true';
    state.environment.RESEND_ADMIN_ALERT_API_KEY = 'legacy-key';
    state.environment.RESEND_ADMIN_ALERT_FROM = 'ops@example.test';
    state.environment.RESEND_ADMIN_ALERT_TO = 'admin@example.test';
    const first = await opsMorningDigestCronResponse(request());
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ outcome: 'SENT' });
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'legacy-key',
        to: ['admin@example.test'],
        targetDate: '2026-10-19',
        subject: 'safe subject',
        text: 'safe body',
      }),
    );
    expect(state.markSent).toHaveBeenCalledTimes(1);

    state.runState.mockResolvedValue({ status: 'SENT', leaseExpiresAt: null });
    const second = await opsMorningDigestCronResponse(request());
    expect(await second.json()).toMatchObject({ outcome: 'ALREADY_SENT' });
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it('fails closed when database-managed email settings exist but are unavailable', async () => {
    state.environment.OPS_DIGEST_ENABLED = 'true';
    state.environment.RESEND_ADMIN_ALERT_API_KEY = 'legacy-key';
    state.environment.RESEND_ADMIN_ALERT_FROM = 'ops@example.test';
    state.environment.RESEND_ADMIN_ALERT_TO = 'admin@example.test';
    state.hasEmailConfig.mockResolvedValue(true);
    const result = await opsMorningDigestCronResponse(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ outcome: 'EMAIL_CONFIGURATION_MISSING' });
    expect(state.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ errorCategory: 'EMAIL_CONFIGURATION_MISSING' }),
    );
    expect(state.send).not.toHaveBeenCalled();
  });

  it('prefers the active database-managed email configuration to legacy environment values', async () => {
    state.environment.OPS_DIGEST_ENABLED = 'true';
    state.environment.RESEND_ADMIN_ALERT_API_KEY = 'legacy-key';
    state.environment.RESEND_ADMIN_ALERT_FROM = 'legacy@example.test';
    state.environment.RESEND_ADMIN_ALERT_TO = 'legacy-admin@example.test';
    state.activeEmail.mockResolvedValue({
      encryptedApiKey: 'ciphertext',
      configuration: {
        fromEmail: 'managed@example.test',
        recipientEmails: ['managed-admin@example.test'],
      },
    });
    await opsMorningDigestCronResponse(request());
    expect(state.hasEmailConfig).not.toHaveBeenCalled();
    expect(state.send).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'decrypted-key',
        from: 'managed@example.test',
        to: ['managed-admin@example.test'],
      }),
    );
  });
});
