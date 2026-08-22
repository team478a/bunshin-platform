import { describe, expect, it, vi } from 'vitest';
import { PrismaMissionAutomationCandidateRepository } from '../src';

const row = (id: string) => ({
  id,
  workspaceId: 'workspace-1',
  userId: 'user-1',
  bunshinId: 'bunshin-1',
  enabled: true,
  notificationConsentAt: new Date('2026-08-01T00:00:00.000Z'),
  localTime: '08:00',
  timezone: 'Asia/Tokyo',
  frequency: 'DAILY' as const,
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  pausedUntil: null,
  reminderEnabled: false,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
});

describe('PrismaMissionAutomationCandidateRepository', () => {
  it('selects only active, consented scopes and reports a bounded scan', async () => {
    const findMany = vi.fn().mockResolvedValue([row('one'), row('two')]);
    const repository = new PrismaMissionAutomationCandidateRepository({
      lineNotificationPreference: { findMany },
    } as never);
    await expect(repository.listEnabled(1)).resolves.toMatchObject({
      candidates: [expect.objectContaining({ id: 'one' })],
      truncated: true,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          notificationConsentAt: { not: null },
          workspace: { status: 'ACTIVE' },
          bunshin: { status: { not: 'ARCHIVED' } },
        }),
        orderBy: { id: 'asc' },
        take: 2,
      }),
    );
  });

  it('rejects an unbounded candidate request', async () => {
    const repository = new PrismaMissionAutomationCandidateRepository({} as never);
    await expect(repository.listEnabled(1_001)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
