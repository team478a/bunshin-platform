import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaCommercialUsageService } from '../src/commercial-usage';

function clientWithMembership(membership: unknown) {
  const groupMembershipFindFirst = vi.fn().mockResolvedValue(membership);
  const serviceUsageEventCreate = vi.fn().mockResolvedValue({ id: 'event-1' });
  const groupMembershipUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const client = {
    groupMembership: {
      findFirst: groupMembershipFindFirst,
      updateMany: groupMembershipUpdateMany,
    },
    serviceUsageEvent: { create: serviceUsageEventCreate },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
  return { client, groupMembershipFindFirst, serviceUsageEventCreate };
}

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
  userId: '00000000-0000-4000-8000-000000000003',
  eventType: 'DAILY_MISSION_VIEW' as const,
  source: 'test',
  idempotencyKey: 'view:1',
};

describe('PrismaCommercialUsageService', () => {
  it('records a tenant-scoped event for an active participant', async () => {
    const { client, serviceUsageEventCreate } = clientWithMembership({
      id: '00000000-0000-4000-8000-000000000004',
      user: { platformAdmin: null, memberships: [] },
    });

    await expect(new PrismaCommercialUsageService(client).record(input)).resolves.toBe('RECORDED');
    expect(serviceUsageEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.userId,
        eventType: input.eventType,
      }),
    });
  });

  it('does not bill a workspace operator even when the user also has a participant membership', async () => {
    const { client, serviceUsageEventCreate } = clientWithMembership({
      id: '00000000-0000-4000-8000-000000000004',
      user: { platformAdmin: null, memberships: [{ id: 'operator-membership' }] },
    });

    await expect(new PrismaCommercialUsageService(client).record(input)).resolves.toBe(
      'NOT_BILLABLE',
    );
    expect(serviceUsageEventCreate).not.toHaveBeenCalled();
  });

  it('does not accept a membership outside the requested workspace and group', async () => {
    const { client, groupMembershipFindFirst, serviceUsageEventCreate } =
      clientWithMembership(null);
    await new PrismaCommercialUsageService(client).record(input);

    expect(groupMembershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          userId: input.userId,
        }),
      }),
    );
    expect(serviceUsageEventCreate).not.toHaveBeenCalled();
  });

  it('builds a tenant-separated current-month profitability view', async () => {
    const serviceUsageGroupBy = vi
      .fn()
      .mockResolvedValueOnce([{ userId: 'member-a' }, { userId: 'member-b' }])
      .mockResolvedValueOnce([{ userId: 'member-c' }]);
    const aiUsageAggregate = vi
      .fn()
      .mockResolvedValueOnce({
        _count: { _all: 3 },
        _sum: { estimatedCostUsdMicros: 12_500n },
      })
      .mockResolvedValueOnce({
        _count: { _all: 1 },
        _sum: { estimatedCostUsdMicros: 7_500n },
      });
    const aiUsageCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const client = {
      workspace: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'workspace-a', name: '運営団体A' },
          { id: 'workspace-b', name: '運営団体B' },
        ]),
      },
      serviceUsageEvent: { groupBy: serviceUsageGroupBy },
      aiUsageEvent: { aggregate: aiUsageAggregate, count: aiUsageCount },
      commercialPricingSchedule: { findFirst: vi.fn().mockResolvedValue(null) },
      oemBillingPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const rows = await new PrismaCommercialUsageService(client).profitabilityDashboard(
      new Date('2026-09-20T00:00:00.000Z'),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        workspaceId: 'workspace-a',
        mau: 2,
        revenueYen: 19_800,
        aiCostUsdMicros: 12_500,
        pricedAiCalls: 3,
        unpricedAiCalls: 1,
      }),
      expect.objectContaining({
        workspaceId: 'workspace-b',
        mau: 1,
        revenueYen: 19_800,
        aiCostUsdMicros: 7_500,
        pricedAiCalls: 1,
        unpricedAiCalls: 0,
      }),
    ]);
    expect(serviceUsageGroupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'workspace-a' }) }),
    );
    expect(serviceUsageGroupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'workspace-b' }) }),
    );
  });

  it('projects current and finalized registration billing evidence without recomputing snapshots', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000011';
    const groupId = '00000000-0000-4000-8000-000000000012';
    const freeGroupId = '00000000-0000-4000-8000-000000000014';
    const userId = '00000000-0000-4000-8000-000000000013';
    const registration = {
      id: 'registration-1',
      workspaceId,
      groupId,
      groupMembershipId: 'membership-1',
      userId,
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt: null,
    };
    const client = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: workspaceId,
          name: '運営団体A',
          organizationEntitlement: { oemEnabled: true },
        }),
      },
      serviceUsageEvent: {
        groupBy: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId,
            groupId: freeGroupId,
            userId,
            eventType: 'POST_VIEW',
            occurredAt: new Date('2026-10-05T00:00:00.000Z'),
          },
          {
            workspaceId,
            groupId: freeGroupId,
            userId: '00000000-0000-4000-8000-000000000015',
            eventType: 'POST_VIEW',
            occurredAt: new Date('2026-10-06T00:00:00.000Z'),
          },
        ]),
      },
      tenantMonthlyUsage: {
        findMany: vi.fn().mockResolvedValue([
          {
            periodStart: new Date('2026-09-01T00:00:00.000Z'),
            mau: 4,
            billableUserCount: 7,
            registeredUserCount: 6,
            freeActiveUserCount: 3,
            overlapUserCount: 2,
            billingRuleVersion: 'OEM_REGISTRATION_BILLING_V2',
            pricingTierKey: 'tier-1',
            calculatedPriceYen: 19_800,
            pricingVersion: '2026-09',
            status: 'FINALIZED',
            finalizedAt: new Date('2026-10-01T00:00:00.000Z'),
          },
        ]),
      },
      oemBillingPolicy: {
        findUnique: vi.fn().mockResolvedValue({
          effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
          historyReadyAt: new Date('2026-09-30T00:00:00.000Z'),
          ruleVersion: 'OEM_REGISTRATION_BILLING_V2',
        }),
      },
      oemRegistrationPeriod: { findMany: vi.fn().mockResolvedValue([registration]) },
      oemOfferingPeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'offering-1',
            workspaceId,
            groupId,
            classification: 'PAID',
            startsAt: new Date('2026-09-01T00:00:00.000Z'),
            endsAt: null,
          },
          {
            id: 'offering-2',
            workspaceId,
            groupId: freeGroupId,
            classification: 'FREE',
            startsAt: new Date('2026-09-01T00:00:00.000Z'),
            endsAt: null,
          },
        ]),
      },
      oemContractPeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'contract-1',
            startsAt: new Date('2026-09-01T00:00:00.000Z'),
            endsAt: null,
          },
        ]),
      },
      groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
      commercialPricingSchedule: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const dashboard = await new PrismaCommercialUsageService(client).dashboard(
      workspaceId,
      new Date('2026-10-11T00:00:00.000Z'),
    );

    expect(dashboard?.current).toMatchObject({
      billingState: 'REGISTRATION_V2',
      billingReviewReason: null,
      registeredUserCount: 1,
      freeActiveUserCount: 2,
      overlapUserCount: 1,
      billableUserCount: 2,
    });
    expect(dashboard?.history[0]).toMatchObject({
      registeredUserCount: 6,
      freeActiveUserCount: 3,
      overlapUserCount: 2,
      billableUserCount: 7,
    });
  });

  it('keeps missing billing history unpriced and exposes a safe review reason', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000021';
    const client = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: workspaceId,
          name: '運営団体B',
          organizationEntitlement: { oemEnabled: true },
        }),
      },
      serviceUsageEvent: {
        groupBy: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      tenantMonthlyUsage: { findMany: vi.fn().mockResolvedValue([]) },
      oemBillingPolicy: {
        findUnique: vi.fn().mockResolvedValue({
          effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
          historyReadyAt: new Date('2026-09-30T00:00:00.000Z'),
          ruleVersion: 'OEM_REGISTRATION_BILLING_V2',
        }),
      },
      oemRegistrationPeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'registration-1',
            workspaceId,
            groupId: '00000000-0000-4000-8000-000000000022',
            groupMembershipId: 'membership-1',
            userId: '00000000-0000-4000-8000-000000000023',
            startsAt: new Date('2026-09-01T00:00:00.000Z'),
            endsAt: null,
          },
        ]),
      },
      oemOfferingPeriod: { findMany: vi.fn().mockResolvedValue([]) },
      oemContractPeriod: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'contract-1', startsAt: new Date('2026-09-01T00:00:00.000Z'), endsAt: null },
          ]),
      },
    } as unknown as PrismaClient;

    const dashboard = await new PrismaCommercialUsageService(client).dashboard(
      workspaceId,
      new Date('2026-10-11T00:00:00.000Z'),
    );

    expect(dashboard?.current).toMatchObject({
      billingState: 'REVIEW_REQUIRED',
      billingReviewReason: 'BILLING_HISTORY_INCOMPLETE',
      registeredUserCount: null,
      freeActiveUserCount: null,
      overlapUserCount: null,
      billableUserCount: null,
      pricing: { priceYen: null, tierKey: 'REVIEW_REQUIRED' },
    });
  });

  it('separates an explicitly ended reviewed contract from the monthly review queue', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000031';
    const client = {
      workspace: { findMany: vi.fn().mockResolvedValue([]) },
      oemBillingPolicy: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId,
            historyReadyAt: new Date('2026-08-31T00:00:00.000Z'),
            ruleVersion: 'OEM_REGISTRATION_BILLING_V2',
          },
        ]),
      },
      oemContractPeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId,
            startsAt: new Date('2026-01-01T00:00:00.000Z'),
            endsAt: new Date('2026-08-31T15:00:00.000Z'),
          },
        ]),
      },
    } as unknown as PrismaClient;
    const service = new PrismaCommercialUsageService(client);
    const finalize = vi.spyOn(service, 'finalizePreviousMonth');

    await expect(
      service.finalizeAllPreviousMonths(new Date('2026-10-12T00:00:00.000Z')),
    ).resolves.toEqual({
      organizations: 1,
      finalized: 0,
      skippedOutsideContract: [
        {
          workspaceId,
          month: '2026-09',
          reason: 'CONTRACT_ENDED_BEFORE_PERIOD',
          lastContractEndedAt: new Date('2026-08-31T15:00:00.000Z'),
        },
      ],
      reviewRequired: [],
    });
    expect(finalize).not.toHaveBeenCalled();
  });

  it('does not skip a contract that overlaps the business-timezone month boundary', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000033';
    const client = {
      workspace: { findMany: vi.fn().mockResolvedValue([]) },
      oemBillingPolicy: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId,
            historyReadyAt: new Date('2026-08-31T00:00:00.000Z'),
            ruleVersion: 'OEM_REGISTRATION_BILLING_V2',
          },
        ]),
      },
      oemContractPeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId,
            startsAt: new Date('2026-01-01T00:00:00.000Z'),
            endsAt: new Date('2026-09-01T00:00:00.000Z'),
          },
        ]),
      },
    } as unknown as PrismaClient;
    const service = new PrismaCommercialUsageService(client);
    const finalize = vi
      .spyOn(service, 'finalizePreviousMonth')
      .mockRejectedValue(new Error('REVIEW_REQUIRED: billing history incomplete'));

    const result = await service.finalizeAllPreviousMonths(new Date('2026-10-12T00:00:00.000Z'));

    expect(result.skippedOutsideContract).toEqual([]);
    expect(result.reviewRequired).toEqual([
      { workspaceId, reason: 'REVIEW_REQUIRED: billing history incomplete' },
    ]);
    expect(finalize).toHaveBeenCalledOnce();
  });

  it('keeps incomplete or future contract history in the existing fail-closed flow', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000032';
    const client = {
      workspace: { findMany: vi.fn().mockResolvedValue([]) },
      oemBillingPolicy: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId,
            historyReadyAt: new Date('2026-08-31T00:00:00.000Z'),
            ruleVersion: 'OEM_REGISTRATION_BILLING_V2',
          },
        ]),
      },
      oemContractPeriod: {
        findMany: vi.fn().mockResolvedValue([
          {
            workspaceId,
            startsAt: new Date('2026-10-01T00:00:00.000Z'),
            endsAt: null,
          },
        ]),
      },
    } as unknown as PrismaClient;
    const service = new PrismaCommercialUsageService(client);
    const finalize = vi
      .spyOn(service, 'finalizePreviousMonth')
      .mockRejectedValue(new Error('REVIEW_REQUIRED: billing history incomplete'));

    await expect(
      service.finalizeAllPreviousMonths(new Date('2026-10-12T00:00:00.000Z')),
    ).resolves.toEqual({
      organizations: 1,
      finalized: 0,
      skippedOutsideContract: [],
      reviewRequired: [{ workspaceId, reason: 'REVIEW_REQUIRED: billing history incomplete' }],
    });
    expect(finalize).toHaveBeenCalledWith(workspaceId, new Date('2026-10-12T00:00:00.000Z'));
  });
});
