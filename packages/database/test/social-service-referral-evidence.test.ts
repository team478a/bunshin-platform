import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaSocialServiceReferralEvidenceRepository } from '../src/social-service-referral-evidence';
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const at = new Date('2026-11-01T00:00:00Z');
const request = () => ({
  actorUserId: id(1),
  scope: { workspaceId: id(2), serviceId: id(3), groupMembershipId: id(4), userId: id(1) },
  asOf: new Date('2026-11-03T00:00:00Z'),
  timezone: 'Asia/Tokyo',
});
function setup() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    bunshin: {
      findMany: vi.fn().mockResolvedValue([{ id: id(5) }]),
      findFirst: vi.fn().mockResolvedValue({ id: id(5) }),
    },
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: id(4) }) },
    serviceLegalDocument: { findMany: vi.fn().mockResolvedValue([]) },
    serviceLegalConsent: { count: vi.fn().mockResolvedValue(0) },
    serviceReferral: {
      findFirst: vi.fn().mockResolvedValue({
        id: id(8),
        status: 'REGISTERED',
        registeredAt: at,
        onboardingCompletedAt: null,
        referralCode: { groupMembershipId: id(6), userId: id(7) },
      }),
    },
    groupMembershipAuditLog: {
      findMany: vi.fn().mockResolvedValue([
        {
          workspaceId: id(2),
          groupId: id(3),
          groupMembershipId: id(4),
          performedByUserId: id(1),
          occurredAt: at,
          action: 'APPROVED',
          reason: 'public service registration',
          beforeData: {},
          afterData: { role: 'PARTICIPANT', status: 'ACTIVE' },
        },
      ]),
    },
    dailyMissionGeneration: { findMany: vi.fn().mockResolvedValue([]) },
    missionContentVariant: { findMany: vi.fn().mockResolvedValue([]) },
    missionActivity: { findMany: vi.fn().mockResolvedValue([]) },
    missionDecision: { findMany: vi.fn().mockResolvedValue([]) },
    postRecord: { findMany: vi.fn().mockResolvedValue([]) },
    aiUsageEvent: { findMany: vi.fn().mockResolvedValue([]) },
    missionContentVariantSelection: { findMany: vi.fn().mockResolvedValue([]) },
    dailyMission: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const transaction = vi.fn((run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    run(tx as unknown as Prisma.TransactionClient),
  );
  const repo = new PrismaSocialServiceReferralEvidenceRepository(
    { $transaction: transaction } as unknown as PrismaClient,
    () => new Date('2026-11-03T00:00:00Z'),
  );
  return { tx, repo, transaction };
}
describe('owner-only SOCIAL referral evidence read', () => {
  it('uses one read-only repeatable snapshot and leaves missing review unknown', async () => {
    const s = setup();
    expect(await s.repo.read(request())).toMatchObject({
      newRegistration: true,
      uniqueAttribution: true,
      review: 'UNKNOWN',
      completeness: 'COMPLETE',
      activities: [],
    });
    expect(s.transaction).toHaveBeenCalledOnce();
    expect(s.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
    expect(s.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(s.tx.serviceReferral.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: id(2),
          groupId: id(3),
          referredMembershipId: id(4),
          referredUserId: id(1),
        }),
      }),
    );
  });
  it('rejects a referrer/admin substitute actor before querying', async () => {
    const s = setup();
    await expect(s.repo.read({ ...request(), actorUserId: id(7) })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId'] as const)(
    'rejects an omitted %s',
    async (key) => {
      const s = setup();
      const input = request();
      Reflect.set(input.scope, key, undefined);
      await expect(s.repo.read(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(s.transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['', 'invalid/zone'])('rejects corrupt timezone %s', async (timezone) => {
    const s = setup();
    await expect(s.repo.read({ ...request(), timezone })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(s.transaction).not.toHaveBeenCalled();
  });
  it.each(['member', 'bunshin', 'consent'] as const)(
    'returns no evidence when %s authorization fails',
    async (kind) => {
      const s = setup();
      if (kind === 'member') s.tx.groupMembership.findFirst.mockResolvedValue(null);
      if (kind === 'bunshin') s.tx.bunshin.findFirst.mockResolvedValue(null);
      if (kind === 'consent')
        s.tx.serviceLegalDocument.findMany.mockResolvedValue([
          { id: id(99), type: 'TERMS', version: 1 },
        ]);
      expect(await s.repo.read(request())).toBeNull();
      expect(s.tx.serviceReferral.findFirst).not.toHaveBeenCalled();
      expect(s.tx.missionActivity.findMany).not.toHaveBeenCalled();
    },
  );
  it('does not fabricate a Bunshin for an empty ownership set', async () => {
    const s = setup();
    s.tx.bunshin.findMany.mockResolvedValue([]);
    expect(await s.repo.read(request())).toBeNull();
    expect(s.tx.serviceReferral.findFirst).not.toHaveBeenCalled();
  });
  it('returns null if the current member has no referral', async () => {
    const s = setup();
    s.tx.serviceReferral.findFirst.mockResolvedValue(null);
    expect(await s.repo.read(request())).toBeNull();
    expect(s.tx.missionActivity.findMany).not.toHaveBeenCalled();
  });
  it('rechecks every owned Bunshin and shares canonical usage queries without nested transactions', async () => {
    const s = setup();
    s.tx.bunshin.findMany.mockResolvedValue([{ id: id(5) }, { id: id(9) }]);
    await s.repo.read(request());
    expect(s.tx.bunshin.findFirst).toHaveBeenCalledTimes(2);
    expect(s.tx.missionActivity.findMany).toHaveBeenCalledTimes(2);
    expect(s.transaction).toHaveBeenCalledOnce();
  });
  it('marks a truncated Bunshin set partial and bounds its source reads', async () => {
    const s = setup();
    s.tx.bunshin.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({ id: id(i + 20) })),
    );
    expect(await s.repo.read(request())).toMatchObject({ completeness: 'PARTIAL' });
    expect(s.tx.missionActivity.findMany).toHaveBeenCalledTimes(20);
  });
  it('marks incomplete source history partial instead of counting it as zero', async () => {
    const s = setup();
    s.tx.missionDecision.findMany.mockResolvedValue([{ decidedAt: null }]);
    expect(await s.repo.read(request())).toMatchObject({ completeness: 'PARTIAL' });
  });
  it('bounds total referral activity across multiple owned Bunshins', async () => {
    const s = setup();
    s.tx.bunshin.findMany.mockResolvedValue([{ id: id(5) }, { id: id(9) }]);
    s.tx.missionActivity.findMany.mockResolvedValue(
      Array.from({ length: 6000 }, (_, n) => ({
        id: id(n + 100),
        dailyMissionId: id(90),
        type: 'COPIED_TEXT',
        occurredAt: at,
      })),
    );
    const result = await s.repo.read(request());
    expect(result?.completeness).toBe('PARTIAL');
    expect(result?.activities.length).toBeLessThanOrEqual(10_000);
  });
  it('snapshots caller scope and time before the first await', async () => {
    const s = setup();
    const input = request();
    const pending = s.repo.read(input);
    input.scope.serviceId = id(99);
    input.asOf.setUTCFullYear(2000);
    await pending;
    expect(s.tx.serviceReferral.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: id(3), createdAt: { lte: request().asOf } }),
      }),
    );
  });
  it('does not derive new registration from missing or truncated audits', async () => {
    const s = setup();
    s.tx.groupMembershipAuditLog.findMany.mockResolvedValue([]);
    expect(await s.repo.read(request())).toMatchObject({ newRegistration: null });
    s.tx.groupMembershipAuditLog.findMany.mockResolvedValue(new Array(101).fill({}));
    expect(await s.repo.read(request())).toMatchObject({
      newRegistration: null,
      completeness: 'PARTIAL',
    });
  });
  it('propagates a source outage instead of returning empty success', async () => {
    const s = setup();
    s.tx.missionActivity.findMany.mockRejectedValue(new Error('source failed'));
    await expect(s.repo.read(request())).rejects.toThrow('source failed');
  });
});
