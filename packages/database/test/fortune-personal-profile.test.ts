import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaFortunePersonalProfileRepository } from '../src/fortune-personal-profile';

const now = new Date('2026-11-20T00:00:00Z');
const actor = { serviceSlug: 'tarot', actorUserId: 'member' };

function fixture(enabled = true) {
  const findSetting = vi.fn().mockResolvedValue({
    id: 'setting',
    workspaceId: 'workspace',
    groupId: 'service',
    personalProfileEnabled: enabled,
    historyRetentionDays: 90,
  });
  const findFirst = vi.fn();
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const erase = vi.fn();
  const db = {
    fortuneServiceSetting: { findFirst: findSetting },
    fortuneParticipant: { findFirst, updateMany },
    fortuneReadingFollowUp: { updateMany: erase },
  } as unknown as PrismaClient;
  return {
    findSetting,
    findFirst,
    updateMany,
    erase,
    repo: new PrismaFortunePersonalProfileRepository(db, () => now),
  };
}

describe('fortune personal profile', () => {
  it('writes only for the current participant in the current service', async () => {
    const { repo, findSetting, updateMany } = fixture();
    await expect(
      repo.update({
        ...actor,
        profile: { consented: true, interest: '仕事', question: null, style: 'DIRECT' },
      }),
    ).resolves.toBe(true);
    expect(findSetting.mock.calls[0]?.[0].where.configuration).toEqual({ slug: 'tarot' });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'service',
        serviceSettingId: 'setting',
        userId: 'member',
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        serviceSetting: { enabled: true, personalProfileEnabled: true },
      },
      data: {
        profileInterest: '仕事',
        profileQuestion: null,
        profileStyle: 'DIRECT',
        profileConsentedAt: now,
        profileUpdatedAt: now,
        understandingItems: Prisma.DbNull,
        understandingRevision: null,
        understandingSavedAt: null,
        understandingExpiresAt: null,
      },
    });
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(repo.update({ ...actor, profile: { consented: false } })).resolves.toBe(false);
  });

  it('allows revocation when disabled and clears all optional input', async () => {
    const { repo, updateMany, erase } = fixture(false);
    await expect(
      repo.update({
        ...actor,
        profile: { consented: true, interest: '仕事', question: null, style: null },
      }),
    ).resolves.toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    await expect(repo.update({ ...actor, profile: { consented: false } })).resolves.toBe(true);
    expect(erase).toHaveBeenCalledWith({
      where: {
        status: { not: 'ERASED' },
        reading: { serviceSettingId: 'setting', memberUserId: 'member' },
      },
      data: { status: 'ERASED', question: null, answer: null, actionStep: null },
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          profileInterest: null,
          profileQuestion: null,
          profileStyle: null,
          profileConsentedAt: null,
          profileUpdatedAt: now,
          understandingItems: Prisma.DbNull,
          understandingRevision: null,
          understandingSavedAt: null,
          understandingExpiresAt: null,
        },
      }),
    );
  });

  it('does not repeat the hearing or return expired text', async () => {
    const { repo, findFirst } = fixture();
    findFirst.mockResolvedValue({
      profileInterest: '仕事',
      profileQuestion: '異動',
      profileStyle: 'DIRECT',
      profileConsentedAt: new Date('2026-01-01'),
      profileUpdatedAt: new Date('2026-01-01'),
    });
    await expect(repo.read(actor)).resolves.toEqual({
      enabled: true,
      completed: true,
      revision: null,
      notificationSlot: null,
      profile: { consented: false, interest: null, question: null, style: null },
    });
  });
});
