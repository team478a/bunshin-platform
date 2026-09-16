import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  connection: vi.fn(),
  pushText: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://www.watashi-works.com' }),
}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ child: () => ({ warn: m.warn, error: m.error }) }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: { groupLineConnection: { findFirst: m.connection } },
}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: () => 'PRODUCTION',
  AesGcmLineSecretCrypto: class {
    decrypt = () => 'access-token';
  },
}));
vi.mock('../src/line/messaging-provider', () => ({
  LineMessagingApiAdapter: class {
    pushText = m.pushText;
  },
}));

import { sendRegistrationCompletionLine } from '../src/services/registration-completion-line';

const input = {
  workspaceId: 'workspace',
  groupId: 'group',
  actorUserId: 'member',
  serviceSlug: 'watashi-works-official',
  serviceName: 'ワタシワークス公式',
  localTime: '08:00',
  cadence: 'DAILY' as const,
};

describe('registration completion LINE', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.connection.mockResolvedValue({
      providerUserId: 'U123',
      configuration: { encryptedAccessToken: 'encrypted' },
    });
    m.pushText.mockResolvedValue({ ok: true });
  });

  it('sends the first-delivery guidance through the dedicated service LINE', async () => {
    await expect(sendRegistrationCompletionLine(input)).resolves.toEqual({ status: 'SENT' });
    expect(m.pushText).toHaveBeenCalledWith({
      accessToken: 'access-token',
      recipientId: 'U123',
      text: expect.stringContaining('毎日08:00ごろ、あなた向けの投稿案をLINEでお届けします。'),
    });
    expect(m.pushText.mock.calls[0]?.[0].text).toContain(
      'https://www.watashi-works.com/s/watashi-works-official/home',
    );
  });

  it('describes scheduled service delivery without promising a daily message', async () => {
    await sendRegistrationCompletionLine({ ...input, cadence: 'SCHEDULED' });
    const text = m.pushText.mock.calls[0]?.[0].text as string;
    expect(text).toContain('投稿予定日の08:00ごろ、あなた向けの投稿案をLINEでお届けします。');
    expect(text).not.toContain('毎日08:00ごろ');
  });

  it('skips safely when the dedicated LINE connection is not ready', async () => {
    m.connection.mockResolvedValue(null);
    await expect(sendRegistrationCompletionLine(input)).resolves.toEqual({
      status: 'SKIPPED',
      reason: 'DEDICATED_LINE_UNAVAILABLE',
    });
    expect(m.pushText).not.toHaveBeenCalled();
  });

  it('does not fail registration when LINE rejects the completion message', async () => {
    m.pushText.mockResolvedValue({
      ok: false,
      category: 'PROVIDER_UNAVAILABLE',
      retryable: true,
    });
    await expect(sendRegistrationCompletionLine(input)).resolves.toEqual({
      status: 'SKIPPED',
      reason: 'PROVIDER_UNAVAILABLE',
    });
    expect(m.warn).toHaveBeenCalled();
  });
});
