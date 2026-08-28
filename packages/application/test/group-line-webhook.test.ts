import { describe, expect, it, vi } from 'vitest';
import {
  ConnectGroupLineMessagingAccount,
  ProcessGroupLineWebhookEvents,
  type GroupLineConnectionRepository,
} from '../src';

const repository = (
  overrides: Partial<GroupLineConnectionRepository> = {},
): GroupLineConnectionRepository => ({
  connectVerified: vi.fn().mockResolvedValue(true),
  applyWebhook: vi.fn().mockResolvedValue('APPLIED'),
  ...overrides,
});

describe('group dedicated LINE connection', () => {
  it('links only an identity already verified by the dedicated login flow', async () => {
    const repo = repository();
    await new ConnectGroupLineMessagingAccount(repo).execute({
      environment: 'PRODUCTION',
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      configurationId: 'configuration-1',
      groupMembershipId: 'membership-1',
      actorUserId: 'user-1',
      verifiedProviderUserId: 'Uverified',
      consentGranted: true,
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repo.connectVerified).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedProviderUserId: 'Uverified' }),
    );
  });

  it('fails closed when the requested member scope does not exist', async () => {
    const repo = repository({ connectVerified: vi.fn().mockResolvedValue(false) });
    await expect(
      new ConnectGroupLineMessagingAccount(repo).execute({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        configurationId: 'configuration-1',
        groupMembershipId: 'membership-1',
        actorUserId: 'user-1',
        verifiedProviderUserId: 'Uverified',
        consentGranted: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps webhook idempotency scoped to the selected configuration', async () => {
    const applyWebhook = vi
      .fn()
      .mockResolvedValueOnce('APPLIED')
      .mockResolvedValueOnce('DUPLICATE');
    const result = await new ProcessGroupLineWebhookEvents(
      repository({ applyWebhook }),
      () => new Date('2026-08-28T12:00:00.000Z'),
    ).execute({
      environment: 'PRODUCTION',
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      configurationId: 'configuration-1',
      events: [
        {
          providerEventId: 'evt-1',
          providerUserId: 'Uverified',
          type: 'FOLLOW',
          occurredAt: new Date('2026-08-28T11:59:00.000Z'),
        },
        {
          providerEventId: 'evt-1',
          providerUserId: 'Uverified',
          type: 'FOLLOW',
          occurredAt: new Date('2026-08-28T11:59:00.000Z'),
        },
      ],
    });

    expect(result).toEqual({
      processed: 2,
      outcomes: {
        APPLIED: 1,
        DUPLICATE: 1,
        IDENTITY_NOT_FOUND: 0,
        CONNECTION_NOT_FOUND: 0,
        IGNORED: 0,
      },
    });
    expect(applyWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        configurationId: 'configuration-1',
      }),
    );
  });
});
