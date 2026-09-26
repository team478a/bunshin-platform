import { describe, expect, it, vi } from 'vitest';
import {
  ServiceLineBroadcastAudienceService,
  type ServiceLineBroadcastAudienceRepository,
} from '../src';

const now = new Date('2026-09-26T03:00:00.000Z');
const scope = {
  workspaceId: 'workspace-a',
  groupId: 'group-a',
  actorUserId: 'manager-a',
};

function repository(overrides: Partial<ServiceLineBroadcastAudienceRepository> = {}) {
  return {
    preview: vi.fn().mockResolvedValue({ recipientCount: 1, capped: false }),
    schedule: vi.fn().mockResolvedValue({
      kind: 'SCHEDULED',
      broadcastId: 'broadcast-a',
      recipientCount: 1,
      scheduledAt: now,
    }),
    ...overrides,
  } satisfies ServiceLineBroadcastAudienceRepository;
}

describe('ServiceLineBroadcastAudienceService', () => {
  it('normalizes duplicate segment values before preview', async () => {
    const store = repository();
    await new ServiceLineBroadcastAudienceService(store, () => now).preview({
      ...scope,
      segment: { industryIds: ['industry-a', 'industry-a'], purposes: ['SALES', 'SALES'] },
    });

    expect(store.preview).toHaveBeenCalledWith({
      ...scope,
      segment: { industryIds: ['industry-a'], purposes: ['SALES'] },
    });
  });

  it('normalizes content and schedules only the confirmed audience size', async () => {
    const store = repository();
    await new ServiceLineBroadcastAudienceService(store, () => now).schedule({
      environment: 'PRODUCTION',
      ...scope,
      title: ' お知らせ ',
      message: ' 今日の案内です。 ',
      reason: ' 配信内容を確認済み ',
      scheduledAt: now,
      expectedRecipientCount: 1,
      segment: { industryIds: [], purposes: ['SALES'] },
    });

    expect(store.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'お知らせ',
        message: '今日の案内です。',
        reason: '配信内容を確認済み',
        expectedRecipientCount: 1,
      }),
    );
  });

  it.each([
    'ACCESS_DENIED',
    'CONFIGURATION_UNAVAILABLE',
    'NO_RECIPIENTS',
    'RECIPIENT_COUNT_CHANGED',
  ] as const)('fails closed for %s', async (kind) => {
    const store = repository({ schedule: vi.fn().mockResolvedValue({ kind }) });
    await expect(
      new ServiceLineBroadcastAudienceService(store, () => now).schedule({
        environment: 'PRODUCTION',
        ...scope,
        title: 'お知らせ',
        message: '今日の案内です。',
        reason: '配信内容を確認済み',
        scheduledAt: now,
        expectedRecipientCount: 1,
        segment: { industryIds: [], purposes: [] },
      }),
    ).rejects.toMatchObject({ code: kind === 'ACCESS_DENIED' ? 'FORBIDDEN' : 'CONFLICT' });
  });
});
