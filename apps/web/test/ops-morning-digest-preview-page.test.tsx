import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  admin: vi.fn(),
  runState: vi.fn(),
  deliveryStatus: vi.fn(),
  alerts: vi.fn(),
  broadcasts: vi.fn(),
  invoices: vi.fn(),
  activeEmail: vi.fn(),
  hasEmailConfiguration: vi.fn(),
  environment: {
    APP_ENV: 'production',
    OPS_DIGEST_ENABLED: 'true',
    APP_URL: 'https://app.example.test/',
    RESEND_ADMIN_ALERT_API_KEY: undefined as string | undefined,
    RESEND_ADMIN_ALERT_FROM: undefined as string | undefined,
    RESEND_ADMIN_ALERT_TO: undefined as string | undefined,
  },
  claim: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: state.actor }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => state.environment }));
vi.mock('@bunshin/application', () => ({
  GetAdminAlerts: class {
    execute = state.alerts;
  },
  opsMorningDigestDateWindow: () => ({
    targetDate: '2026-10-19',
    from: new Date('2026-10-18T15:00:00.000Z'),
    to: new Date('2026-10-19T15:00:00.000Z'),
  }),
  buildOpsMorningDigest: (input: {
    targetDate: string;
    previousDelivery: string;
    alerts: { status: string };
  }) => ({
    targetDate: input.targetDate,
    status: 'NO_ISSUES',
    criticalCount: 0,
    warningCount: 0,
    subject: '【運用】10/19 異常なし',
    body: `前日の定期処理・配信・通知はすべて正常でした。\n管理画面：https://app.example.test/admin/alerts\n履歴：${input.previousDelivery}${input.alerts.status === 'UNAVAILABLE' ? '\n運用通知センター：取得失敗' : ''}`,
  }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaPlatformAdminRepository: class {
    findActivePlatformAdminByUserId = state.admin;
  },
  PrismaOpsMorningDigestRunRepository: class {
    runState = state.runState;
    deliveryStatus = state.deliveryStatus;
    claim = state.claim;
    markSent = state.markSent;
    markFailed = state.markFailed;
  },
  PrismaOpsMorningDigestCollector: class {
    serviceLineBroadcasts = state.broadcasts;
    tenantInvoiceStatuses = state.invoices;
  },
  PrismaAdminAlertRepository: class {},
  PrismaAdminEmailConfigurationRepository: class {
    active = state.activeEmail;
    hasConfiguration = state.hasEmailConfiguration;
  },
}));
vi.mock('../src/email/secure-admin-email-configuration', () => ({
  currentAdminEmailEnvironment: () => 'PRODUCTION',
  AesGcmAdminEmailSecretCrypto: class {
    decrypt = vi.fn(() => 'secret-api-key-from-test');
  },
}));
vi.mock('../src/email/ops-morning-digest-resend', () => ({
  OpsMorningDigestResend: class {
    send = state.send;
  },
}));

import Page from '../app/(app)/admin/alerts/morning-digest/page';

const renderPage = async () => renderToStaticMarkup(await Page());

describe('morning digest admin preview page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state.environment, {
      APP_ENV: 'production',
      OPS_DIGEST_ENABLED: 'true',
      APP_URL: 'https://app.example.test/',
      RESEND_ADMIN_ALERT_API_KEY: undefined,
      RESEND_ADMIN_ALERT_FROM: undefined,
      RESEND_ADMIN_ALERT_TO: undefined,
    });
    state.actor.mockResolvedValue({ userId: 'admin-user' });
    state.admin.mockResolvedValue({ role: 'SUPER_ADMIN' });
    state.runState.mockResolvedValue({
      status: 'SENT',
      leaseExpiresAt: null,
      errorCategory: null,
    });
    state.deliveryStatus.mockResolvedValue('BEFORE_HISTORY');
    state.alerts.mockResolvedValue({ alerts: [], generatedAt: new Date() });
    state.broadcasts.mockResolvedValue({
      serviceBroadcasts: { status: 'OK', value: [] },
      fortuneWeeklyBroadcasts: {
        status: 'NOT_APPLICABLE',
        reason: 'NO_SCHEDULED_FORTUNE_DELIVERY',
      },
      missingBroadcastDateCount: { status: 'OK', value: 0 },
    });
    state.invoices.mockResolvedValue({ status: 'OK', value: [] });
    state.activeEmail.mockResolvedValue({
      encryptedApiKey: 'ciphertext',
      configuration: {
        fromEmail: 'private-sender@example.test',
        recipientEmails: ['private-recipient@example.test'],
      },
    });
    state.hasEmailConfiguration.mockResolvedValue(false);
  });

  it('uses the logged-in active admin and renders the exact shared report without revealing email settings', async () => {
    const html = await renderPage();
    expect(state.admin).toHaveBeenCalledWith('admin-user');
    expect(state.alerts).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'admin-user', environment: 'PRODUCTION' }),
    );
    expect(html).toContain('2026-10-19');
    expect(html).toContain('【運用】10/19 異常なし');
    expect(html).toContain('前日の定期処理・配信・通知はすべて正常でした。');
    expect(html).toContain('OPS_DIGEST_ENABLED');
    expect(html).toContain('送信済み');
    expect(html).toContain('履歴開始前');
    expect(html).toContain('宛先数</dt><dd>1件');
    expect(html).not.toContain('secret-api-key-from-test');
    expect(html).not.toContain('private-sender@example.test');
    expect(html).not.toContain('private-recipient@example.test');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
    expect(state.claim).not.toHaveBeenCalled();
    expect(state.markSent).not.toHaveBeenCalled();
    expect(state.markFailed).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });

  it('denies signed-out and inactive admin accounts before reading preview data', async () => {
    state.actor.mockResolvedValueOnce(null);
    await expect(renderPage()).rejects.toThrow('REDIRECT:/login');
    state.admin.mockResolvedValueOnce(null);
    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
    expect(state.alerts).not.toHaveBeenCalled();
  });

  it('shows staging context and not-ready values without leaking legacy addresses', async () => {
    state.environment.APP_ENV = 'staging';
    state.environment.OPS_DIGEST_ENABLED = 'false';
    state.activeEmail.mockResolvedValue(null);
    state.hasEmailConfiguration.mockResolvedValue(false);
    state.environment.RESEND_ADMIN_ALERT_API_KEY = undefined;
    state.environment.RESEND_ADMIN_ALERT_FROM = 'private-sender@example.test';
    state.environment.RESEND_ADMIN_ALERT_TO = 'private-recipient@example.test';
    const html = await renderPage();
    expect(html).toContain('本番環境ではありません。表示はこの環境のデータです。');
    expect(html).toContain('OPS_DIGEST_ENABLED</dt><dd>いいえ');
    expect(html).toContain('管理用メール設定</dt><dd>いいえ');
    expect(html).toContain('宛先数</dt><dd>1件');
    expect(html).not.toContain('private-sender@example.test');
    expect(html).not.toContain('private-recipient@example.test');
  });

  it('renders failed and running ledger states and degrades safely when reads fail', async () => {
    state.runState.mockResolvedValueOnce({
      status: 'FAILED',
      leaseExpiresAt: null,
      errorCategory: 'EMAIL_PROVIDER_FAILED',
    });
    expect(await renderPage()).toContain('失敗：EMAIL_PROVIDER_FAILED');

    state.runState.mockResolvedValueOnce({
      status: 'CLAIMED',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      errorCategory: null,
    });
    expect(await renderPage()).toContain('実行中');

    state.runState.mockRejectedValueOnce(new Error('private database detail'));
    state.deliveryStatus.mockRejectedValueOnce(new Error('private history detail'));
    state.alerts.mockRejectedValueOnce(new Error('private alert detail'));
    const html = await renderPage();
    expect(html).toContain('送信記録テーブル</dt><dd>確認できない');
    expect(html).toContain('今日の対象日：確認できない');
    expect(html).toContain('運用通知センター：取得失敗');
    expect(html).toContain('前日：確認できない');
    expect(html).not.toContain('private alert detail');
    expect(html).not.toContain('private database detail');
    expect(html).not.toContain('private history detail');
  });
});
