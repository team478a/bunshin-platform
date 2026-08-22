import { describe, expect, it, vi } from 'vitest';
import {
  ConnectLineMessagingAccount,
  DisconnectLineMessagingAccount,
  ProcessLineWebhookEvents,
  type LineConnectionRepository,
} from '../src';

const now = new Date('2026-08-22T06:00:00.000Z');

function repository() {
  const connect = vi.fn().mockResolvedValue({
    id: 'connection-a',
    environment: 'PRODUCTION',
    workspaceId: 'workspace-a',
    userId: 'user-a',
    status: 'ACTIVE',
    friendshipStatus: 'UNKNOWN',
    notificationConsentAt: now,
    followedAt: null,
    unfollowedAt: null,
    lastWebhookAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const disconnect = vi.fn().mockResolvedValue(true);
  const applyWebhook = vi.fn().mockResolvedValue('APPLIED');
  const resolve = vi.fn();
  return {
    repo: { connect, disconnect, applyWebhook, resolve } as LineConnectionRepository,
    connect,
    disconnect,
    applyWebhook,
  };
}

describe('LINE connection core', () => {
  it('connects only through a repository-confirmed verified identity scope', async () => {
    const { repo, connect } = repository();
    await expect(
      new ConnectLineMessagingAccount(repo).execute({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-a',
        actorUserId: 'user-a',
        verifiedProviderUserId: 'U0123456789abcdef',
        consentGranted: true,
      }),
    ).resolves.toMatchObject({ id: 'connection-a' });
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ providerUserId: 'U0123456789abcdef' }),
    );
  });

  it('does not expose a connection when identity ownership is rejected', async () => {
    const { repo, connect } = repository();
    connect.mockResolvedValue(null);
    await expect(
      new ConnectLineMessagingAccount(repo).execute({
        environment: 'PRODUCTION',
        workspaceId: 'workspace-b',
        actorUserId: 'user-a',
        verifiedProviderUserId: 'U0123456789abcdef',
        consentGranted: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('disconnects through the environment and actor scoped boundary', async () => {
    const { repo, disconnect } = repository();
    await new DisconnectLineMessagingAccount(repo).execute({
      environment: 'STAGING',
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
    });
    expect(disconnect).toHaveBeenCalledWith({
      environment: 'STAGING',
      workspaceId: 'workspace-a',
      actorUserId: 'user-a',
    });
  });

  it('processes follow, duplicate and ignored events without storing raw payloads', async () => {
    const { repo, applyWebhook } = repository();
    applyWebhook
      .mockResolvedValueOnce('APPLIED')
      .mockResolvedValueOnce('DUPLICATE')
      .mockResolvedValueOnce('IGNORED');
    const result = await new ProcessLineWebhookEvents(repo, () => now).execute({
      environment: 'PRODUCTION',
      events: [
        {
          providerEventId: 'evt-1',
          providerUserId: 'U0123456789abcdef',
          type: 'FOLLOW',
          occurredAt: now,
        },
        {
          providerEventId: 'evt-1',
          providerUserId: 'U0123456789abcdef',
          type: 'FOLLOW',
          occurredAt: now,
        },
        { providerEventId: 'evt-2', providerUserId: null, type: 'OTHER', occurredAt: now },
      ],
    });
    expect(result).toEqual({
      processed: 3,
      outcomes: {
        APPLIED: 1,
        DUPLICATE: 1,
        IDENTITY_NOT_FOUND: 0,
        CONNECTION_NOT_FOUND: 0,
        IGNORED: 1,
      },
    });
  });
});
