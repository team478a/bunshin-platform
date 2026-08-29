import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialImageGenerationExecutionRepository } from '../src';

const now = new Date('2026-08-28T12:00:00.000Z');
const request = {
  id: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  groupId: '00000000-0000-4000-8000-000000000003',
  groupMembershipId: '00000000-0000-4000-8000-000000000004',
  ownerUserId: '00000000-0000-4000-8000-000000000005',
  bunshinId: '00000000-0000-4000-8000-000000000006',
  dailyMissionId: '00000000-0000-4000-8000-000000000007',
  campaignId: null,
  status: 'QUEUED',
  layout: {
    templateKey: 'THREE_POINTS',
    headline: '今日の3つ',
    bodyLines: ['ひとつ', 'ふたつ', 'みっつ'],
    cta: '保存してください',
    accentColor: '#FF3B30',
  },
  pilotEnrollment: {
    status: 'ACTIVE',
    revokedAt: null,
    pilot: {
      id: '00000000-0000-4000-8000-000000000008',
      status: 'ACTIVE',
      emergencyStop: false,
      startsAt: null,
      endsAt: null,
      dailyLimit: 10,
      monthlyLimit: 100,
      memberMonthlyLimit: 20,
      defaultModel: 'gpt-image-1',
      defaultQuality: 'medium',
    },
  },
};

const approvalEvidence = [
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
  'FINAL_APPROVAL',
].map((checkKey) => ({ checkKey, action: 'RECORDED' }));

function transaction(overrides: Record<string, unknown> = {}) {
  const tx = {
    socialImageGenerationRequest: {
      findFirst: vi.fn().mockResolvedValue(request),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: request.groupMembershipId }) },
    socialImagePilotEvidence: { findMany: vi.fn().mockResolvedValue(approvalEvidence) },
    bunshin: { findFirst: vi.fn().mockResolvedValue({ id: request.bunshinId }) },
    campaign: { findFirst: vi.fn() },
    ...overrides,
  };
  return tx;
}

function repository(tx: ReturnType<typeof transaction>) {
  return new PrismaSocialImageGenerationExecutionRepository({
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  } as never);
}

const input = {
  workspaceId: request.workspaceId,
  requestId: request.id,
  now,
  dailyFrom: new Date('2026-08-28T00:00:00.000Z'),
  monthlyFrom: new Date('2026-08-01T00:00:00.000Z'),
};

describe('PrismaSocialImageGenerationExecutionRepository', () => {
  it('rechecks current scope and claims one queued request', async () => {
    const tx = transaction();
    await expect(repository(tx).claim(input)).resolves.toMatchObject({
      allowed: true,
      context: { requestId: request.id, model: 'gpt-image-1', quality: 'medium' },
    });
    expect(tx.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: request.workspaceId,
          groupId: request.groupId,
          userId: request.ownerUserId,
        }),
      }),
    );
    expect(tx.socialImageGenerationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'QUEUED' }) }),
    );
  });

  it('blocks before provider execution when the emergency stop is active', async () => {
    const tx = transaction({
      socialImageGenerationRequest: {
        findFirst: vi.fn().mockResolvedValue({
          ...request,
          pilotEnrollment: {
            ...request.pilotEnrollment,
            pilot: { ...request.pilotEnrollment.pilot, emergencyStop: true },
          },
        }),
        count: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(repository(tx).claim(input)).resolves.toEqual({
      allowed: false,
      reason: 'PILOT_STOPPED',
    });
    expect(tx.socialImageGenerationRequest.count).not.toHaveBeenCalled();
  });

  it('blocks when a pilot success limit has been reached', async () => {
    const tx = transaction();
    tx.socialImageGenerationRequest.count
      .mockResolvedValueOnce(request.pilotEnrollment.pilot.dailyLimit)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(2);
    await expect(repository(tx).claim(input)).resolves.toEqual({
      allowed: false,
      reason: 'DAILY_LIMIT_REACHED',
    });
    expect(tx.socialImageGenerationRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rechecks final approval immediately before provider execution', async () => {
    const tx = transaction({
      socialImagePilotEvidence: {
        findMany: vi.fn().mockResolvedValue([
          ...approvalEvidence,
          {
            checkKey: 'FINAL_APPROVAL',
            action: 'REVOKED',
          },
        ]),
      },
    });
    await expect(repository(tx).claim(input)).resolves.toEqual({
      allowed: false,
      reason: 'PILOT_STOPPED',
    });
    expect(tx.socialImageGenerationRequest.updateMany).not.toHaveBeenCalled();
  });
});
