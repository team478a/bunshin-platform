import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  enqueue: vi.fn(),
  findMany: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  eligible: vi.fn(),
  apiKey: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://service.example' }),
}));
vi.mock('../src/email/service-registration-email', () => ({
  ServiceRegistrationResendAdapter: class {},
  serviceEmailApiKey: state.apiKey,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    socialActivityOemSupportCandidateEmailDelivery: {
      findMany: state.findMany,
      updateMany: state.claim,
      update: state.update,
    },
  },
  enqueueSocialActivityOemSupportCandidateEmails: state.enqueue,
  isSocialActivityOemSupportCandidateEmailDeliveryEligible: state.eligible,
}));

const { runOemSupportCandidateEmailWorker } =
  await import('../src/services/oem-support-candidate-email-worker');

const delivery = {
  id: 'delivery-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  configurationId: 'configuration-1',
  candidateId: 'candidate-1',
  recipientUserId: 'manager-1',
  recipientEmail: 'manager@example.com',
  recipientName: 'Manager',
  fromName: 'Service',
  fromEmail: 'service@example.com',
  replyToEmail: null,
  subject: '支援候補',
  body: '確認してください',
  attemptCount: 0,
  emailConfiguration: { enabled: true, lastVerifiedAt: new Date('2026-09-28T00:00:00Z') },
};

describe('OEM support candidate email worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.enqueue.mockResolvedValue({ selected: 1, queued: 1, skipped: 0 });
    state.findMany.mockResolvedValue([delivery]);
    state.claim.mockResolvedValue({ count: 1 });
    state.update.mockResolvedValue({});
    state.apiKey.mockResolvedValue('decrypted-key');
  });

  it('配信直前に資格を失った宛先をSKIPPEDにしてProviderへ渡さない', async () => {
    state.eligible.mockResolvedValue(false);
    const sender = { send: vi.fn() };

    await expect(
      runOemSupportCandidateEmailWorker(new Date('2026-09-28T01:00:00Z'), sender as never),
    ).resolves.toMatchObject({ selected: 1, sent: 0, failed: 0, skipped: 1 });

    expect(sender.send).not.toHaveBeenCalled();
    expect(state.apiKey).not.toHaveBeenCalled();
    expect(state.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'SKIPPED', lastErrorCategory: 'NOTIFICATION_NO_LONGER_ELIGIBLE' },
    });
  });

  it('最新資格が有効な場合だけProvider送信しSENTを記録する', async () => {
    state.eligible.mockResolvedValue(true);
    const sender = { send: vi.fn().mockResolvedValue('provider-message-1') };
    const now = new Date('2026-09-28T01:00:00Z');

    await expect(runOemSupportCandidateEmailWorker(now, sender as never)).resolves.toMatchObject({
      selected: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
    });

    expect(sender.send).toHaveBeenCalledOnce();
    expect(state.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: {
        status: 'SENT',
        providerMessageId: 'provider-message-1',
        sentAt: now,
        lastErrorCategory: null,
      },
    });
  });
});
