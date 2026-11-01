import type { Prisma, PrismaClient } from '@prisma/client';
import { GetMemberUsageSummary, type MemberUsageRequest } from '@bunshin/application';
import { describe, expect, it, vi } from 'vitest';
import {
  MEMBER_USAGE_SOURCE_LIMIT,
  PrismaMemberUsageRepository,
} from '../src/member-usage-repository';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const at = new Date('2026-11-01T00:00:00Z');
const now = new Date('2026-11-02T00:00:00Z');
const request: MemberUsageRequest = {
  actorUserId: id(1),
  scope: {
    userId: id(1),
    workspaceId: id(2),
    serviceId: id(3),
    groupMembershipId: id(4),
    bunshinId: id(5),
  },
  asOf: at,
  timezone: 'Asia/Tokyo',
};
function setup() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    groupMembership: { findFirst: vi.fn().mockResolvedValue({ id: id(4) }) },
    bunshin: { findFirst: vi.fn().mockResolvedValue({ id: id(5) }) },
    serviceLegalDocument: { findMany: vi.fn().mockResolvedValue([]) },
    serviceLegalConsent: { count: vi.fn().mockResolvedValue(0) },
    dailyMissionGeneration: { findMany: vi.fn().mockResolvedValue([]) },
    missionContentVariant: { findMany: vi.fn().mockResolvedValue([]) },
    missionActivity: { findMany: vi.fn().mockResolvedValue([]) },
    missionDecision: { findMany: vi.fn().mockResolvedValue([]) },
    postRecord: { findMany: vi.fn().mockResolvedValue([]) },
    aiUsageEvent: { findMany: vi.fn().mockResolvedValue([]) },
    missionContentVariantSelection: { findMany: vi.fn().mockResolvedValue([]) },
    dailyMission: { findMany: vi.fn().mockResolvedValue([{ id: id(6) }]) },
  };
  const transaction = vi.fn((run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
    run(tx as unknown as Prisma.TransactionClient),
  );
  const repository = new PrismaMemberUsageRepository(
    { $transaction: transaction } as unknown as PrismaClient,
    () => now,
  );
  return {
    tx,
    transaction,
    repository,
    summary: () => new GetMemberUsageSummary(repository, repository).execute(request),
  };
}

describe('member usage DB adapter', () => {
  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
    'rejects an omitted %s before Prisma can drop an undefined filter',
    (key) => {
      const s = setup();
      const scope = { ...request.scope };
      Reflect.deleteProperty(scope, key);
      expect(() => s.repository.read({ ...request, scope })).toThrow(
        'invalid member usage request',
      );
      expect(s.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid cutoff before a transaction', () => {
    const s = setup();
    expect(() => s.repository.read({ ...request, asOf: new Date('invalid') })).toThrow(
      'invalid member usage request',
    );
    expect(s.transaction).not.toHaveBeenCalled();
  });

  it('rechecks authorization in read-only repeatable snapshots and reads no activity for denial', async () => {
    const s = setup();
    expect(await s.repository.authorize(request)).toBe(true);
    s.tx.groupMembership.findFirst.mockResolvedValue(null);
    expect(await s.repository.read(request)).toBeNull();
    expect(s.tx.missionActivity.findMany).not.toHaveBeenCalled();
    expect(s.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      maxWait: 3000,
      timeout: 20000,
    });
    expect(s.tx.$executeRaw.mock.calls[0]?.[0]).toEqual(['SET TRANSACTION READ ONLY']);
  });

  it('uses current time for service validity, consent and active owner boundaries', async () => {
    const s = setup();
    await s.repository.read(request);
    expect(s.tx.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: id(4),
          workspaceId: id(2),
          groupId: id(3),
          userId: id(1),
          status: 'ACTIVE',
          consentedAt: { lte: now },
          user: { status: 'ACTIVE' },
          workspace: {
            status: 'ACTIVE',
            memberships: { some: { userId: id(1), status: 'ACTIVE' } },
          },
        }),
      }),
    );
    expect(s.tx.bunshin.findFirst).toHaveBeenCalledWith({
      where: {
        id: id(5),
        workspaceId: id(2),
        groupId: id(3),
        ownerUserId: id(1),
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });
    const serialized = JSON.stringify(s.tx.groupMembership.findFirst.mock.calls);
    expect(serialized).toContain(now.toISOString());
    expect(serialized).not.toContain(at.toISOString());
  });

  it('does not let a different actor use a valid owner scope', async () => {
    const s = setup();
    const foreign = { ...request, actorUserId: id(9) };
    expect(await s.repository.authorize(foreign)).toBe(false);
    expect(await s.repository.read(foreign)).toBeNull();
    expect(s.tx.groupMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies missing owned Bunshin before reading sources', async () => {
    const s = setup();
    s.tx.bunshin.findFirst.mockResolvedValue(null);
    expect(await s.repository.read(request)).toBeNull();
    expect(s.tx.aiUsageEvent.findMany).not.toHaveBeenCalled();
  });

  it('requires the latest effective document for every type, not an old acceptance', async () => {
    const s = setup();
    s.tx.serviceLegalDocument.findMany.mockResolvedValue([
      { id: id(10), type: 'TERMS', version: 1 },
      { id: id(11), type: 'TERMS', version: 2 },
      { id: id(12), type: 'PRIVACY', version: 1 },
    ]);
    s.tx.serviceLegalConsent.count.mockResolvedValue(1);
    expect(await s.repository.read(request)).toBeNull();
    expect(s.tx.serviceLegalConsent.count).toHaveBeenCalledWith({
      where: {
        workspaceId: id(2),
        groupId: id(3),
        groupMembershipId: id(4),
        userId: id(1),
        legalDocumentId: { in: [id(11), id(12)] },
        consentedAt: { lte: now },
      },
    });
    expect(s.tx.postRecord.findMany).not.toHaveBeenCalled();
  });

  it('bounds every source query and applies exact owner filters without selecting content', async () => {
    const s = setup();
    await s.repository.read(request);
    const owned = { workspaceId: id(2), bunshinId: id(5), actorUserId: id(1) };
    for (const delegate of [
      s.tx.dailyMissionGeneration,
      s.tx.missionContentVariant,
      s.tx.missionActivity,
      s.tx.postRecord,
      s.tx.aiUsageEvent,
      s.tx.missionContentVariantSelection,
    ]) {
      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining(owned),
          take: MEMBER_USAGE_SOURCE_LIMIT + 1,
        }),
      );
    }
    expect(s.tx.missionDecision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: id(2), bunshinId: id(5) }),
        take: MEMBER_USAGE_SOURCE_LIMIT + 1,
      }),
    );
    const calls = JSON.stringify([
      s.tx.missionActivity.findMany.mock.calls,
      s.tx.postRecord.findMany.mock.calls,
      s.tx.missionContentVariant.findMany.mock.calls,
    ]);
    for (const forbidden of [
      'contentJson',
      'metadata',
      'manualMetrics',
      'postUrl',
      'rejectionDetail',
      'BunshinMemory',
    ])
      expect(calls).not.toContain(forbidden);
  });

  it('maps completed primary and saved legacy variants to UNKNOWN without counting orphan claims', async () => {
    const s = setup();
    s.tx.dailyMissionGeneration.findMany.mockResolvedValue([
      { id: id(20), dailyMissionId: id(6), updatedAt: at },
      { id: id(21), dailyMissionId: id(6), updatedAt: at },
      { id: id(22), dailyMissionId: id(99), updatedAt: at },
    ]);
    s.tx.missionContentVariant.findMany.mockResolvedValue([
      { id: id(30), createdAt: at, generation: null },
    ]);
    const result = await s.summary();
    expect(result.allTime).toMatchObject({
      generated: 2,
      unknownTriggerGenerations: 2,
      activeDays: 0,
    });
    expect(s.tx.dailyMission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: id(2), bunshinId: id(5) }),
      }),
    );
  });

  it('projects variant selection as acceptance and avoids double counting a matching Activity and snapshot', async () => {
    const s = setup();
    s.tx.missionActivity.findMany.mockResolvedValue([
      { id: id(40), dailyMissionId: id(6), type: 'ACCEPTED', occurredAt: at },
    ]);
    s.tx.missionContentVariantSelection.findMany.mockResolvedValue([
      { id: id(41), dailyMissionId: id(6), selectedAt: at },
    ]);
    s.tx.missionDecision.findMany.mockResolvedValue([
      { id: id(42), dailyMissionId: id(6), decision: 'ACCEPTED', decidedAt: at },
    ]);
    expect((await s.summary()).allTime).toMatchObject({ accepted: 1, activeDays: 1 });
  });

  it('uses report creation time, not the claimed publication time, and costs only the AI ledger', async () => {
    const s = setup();
    s.tx.postRecord.findMany.mockResolvedValue([
      { id: id(50), dailyMissionId: id(6), createdAt: at },
    ]);
    s.tx.aiUsageEvent.findMany.mockResolvedValue([
      { id: id(51), occurredAt: at, estimatedCostUsdMicros: 7n },
      { id: id(52), occurredAt: at, estimatedCostUsdMicros: null },
    ]);
    expect((await s.summary()).allTime).toMatchObject({
      selfReportedPosts: 1,
      lastActiveAt: at.toISOString(),
      aiCost: { knownUsdMicros: '7', unknownEvents: 1 },
    });
    expect(JSON.stringify(s.tx.postRecord.findMany.mock.calls)).not.toContain('postedAt');
    expect(JSON.stringify(s.tx.aiUsageEvent.findMany.mock.calls)).not.toContain('status');
  });

  it('returns PARTIAL on a bound overflow and the Application refuses a misleading total', async () => {
    const s = setup();
    s.tx.aiUsageEvent.findMany.mockResolvedValue(
      Array.from({ length: MEMBER_USAGE_SOURCE_LIMIT + 1 }, (_, n) => ({
        id: id(n + 100),
        occurredAt: at,
        estimatedCostUsdMicros: 1n,
      })),
    );
    expect((await s.repository.read(request))?.completeness).toBe('PARTIAL');
    await expect(s.summary()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not invent a missing decision timestamp', async () => {
    const s = setup();
    s.tx.missionDecision.findMany.mockResolvedValue([
      { id: id(60), dailyMissionId: id(6), decision: 'ACCEPTED', decidedAt: null },
    ]);
    await expect(s.summary()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('propagates query failures', async () => {
    const s = setup();
    s.tx.aiUsageEvent.findMany.mockRejectedValue(new Error('unavailable'));
    await expect(s.summary()).rejects.toThrow('unavailable');
  });

  it('snapshots input before asynchronous authorization reads', async () => {
    const s = setup();
    const input = { ...request, scope: { ...request.scope }, asOf: new Date(at) };
    s.tx.groupMembership.findFirst.mockImplementation(() => {
      input.scope.userId = id(90);
      input.asOf.setFullYear(2030);
      return Promise.resolve({ id: id(4) });
    });
    const result = await s.repository.read(input);
    expect(result?.scope).toEqual(request.scope);
    expect(s.tx.aiUsageEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actorUserId: id(1), occurredAt: { lte: at } }),
      }),
    );
  });
});
