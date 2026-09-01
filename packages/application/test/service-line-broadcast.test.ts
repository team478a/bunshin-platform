import { describe, expect, it, vi } from 'vitest';
import {
  ServiceLineBroadcastService,
  type ServiceLineBroadcastRepository,
} from '../src/service-line-broadcast';

const now = new Date('2026-09-01T00:00:00.000Z');
const base = {
  id: 'broadcast-1',
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  title: '今週のお知らせ',
  message: '投稿を一つ完成させましょう。',
  audience: 'ACTIVE_PARTICIPANTS' as const,
  status: 'DRAFT' as const,
  scheduledAt: null,
  cancelledAt: null,
  completedAt: null,
  createdByUserId: 'manager-1',
  updatedByUserId: 'manager-1',
  createdAt: now,
  updatedAt: now,
};

function repository(overrides: Partial<ServiceLineBroadcastRepository> = {}) {
  const create = vi.fn().mockResolvedValue(base);
  const schedule = vi.fn().mockResolvedValue({ ...base, status: 'SCHEDULED' as const });
  const cancel = vi.fn().mockResolvedValue({ ...base, status: 'CANCELLED' as const });
  const value: ServiceLineBroadcastRepository = { create, schedule, cancel, ...overrides };
  return { value, create };
}

describe('ServiceLineBroadcastService', () => {
  it('creates a draft for active participants only', async () => {
    const store = repository();
    const service = new ServiceLineBroadcastService(store.value, () => now);

    await expect(
      service.create({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        actorUserId: 'manager-1',
        title: ' 今週のお知らせ ',
        message: ' 投稿を一つ完成させましょう。 ',
        audience: 'ACTIVE_PARTICIPANTS',
        reason: '運営案内を準備するため',
      }),
    ).resolves.toMatchObject({ status: 'DRAFT' });

    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '今週のお知らせ', message: '投稿を一つ完成させましょう。' }),
    );
  });

  it('does not schedule a broadcast in the past', async () => {
    const service = new ServiceLineBroadcastService(repository().value, () => now);

    await expect(
      service.schedule({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        broadcastId: 'broadcast-1',
        actorUserId: 'manager-1',
        scheduledAt: now,
        reason: '予約時刻を設定するため',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not treat an already completed broadcast as cancellable', async () => {
    const service = new ServiceLineBroadcastService(
      repository({ cancel: vi.fn().mockResolvedValue(null) }).value,
      () => now,
    );

    await expect(
      service.cancel({
        workspaceId: 'workspace-1',
        groupId: 'group-1',
        broadcastId: 'broadcast-1',
        actorUserId: 'manager-1',
        reason: '誤配信を防ぐため',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
