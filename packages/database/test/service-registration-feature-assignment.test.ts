import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { assignEnabledServiceFeaturesToRegistrant } from '../src/service-registration-feature-assignment';

const mocks = {
  policies: vi.fn(),
  assignments: vi.fn(),
  createAssignment: vi.fn(),
  createAudit: vi.fn(),
};

const tx = {
  groupFeaturePolicy: { findMany: mocks.policies },
  groupMemberFeatureAssignment: {
    findMany: mocks.assignments,
    create: mocks.createAssignment,
  },
  groupFeatureAuditLog: { create: mocks.createAudit },
} as unknown as Prisma.TransactionClient;

const input = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  groupId: '20000000-0000-4000-8000-000000000002',
  groupMembershipId: '30000000-0000-4000-8000-000000000003',
  userId: '40000000-0000-4000-8000-000000000004',
};

describe('public service registration feature assignment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.policies.mockResolvedValue([]);
    mocks.assignments.mockResolvedValue([]);
    mocks.createAssignment.mockResolvedValue({});
    mocks.createAudit.mockResolvedValue({});
  });

  it('assigns every active feature enabled for the same service scope', async () => {
    mocks.policies.mockResolvedValue([
      { featureKey: 'LINE.DAILY_NOTIFICATION' },
      { featureKey: 'SOCIAL' },
    ]);

    await assignEnabledServiceFeaturesToRegistrant(tx, input);

    expect(mocks.policies).toHaveBeenCalledWith({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        status: 'ENABLED',
        feature: { status: 'ACTIVE' },
      },
      select: { featureKey: true },
      orderBy: { featureKey: 'asc' },
    });
    expect(mocks.createAssignment).toHaveBeenCalledTimes(2);
    expect(mocks.createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        groupMembershipId: input.groupMembershipId,
        featureKey: 'SOCIAL',
        status: 'ENABLED',
        assignedByUserId: input.userId,
      }),
    });
    expect(mocks.createAudit).toHaveBeenCalledTimes(2);
  });

  it('preserves an existing member assignment, including an explicit stop', async () => {
    mocks.policies.mockResolvedValue([
      { featureKey: 'LINE.DAILY_NOTIFICATION' },
      { featureKey: 'SOCIAL' },
    ]);
    mocks.assignments.mockResolvedValue([{ featureKey: 'SOCIAL' }]);

    await assignEnabledServiceFeaturesToRegistrant(tx, input);

    expect(mocks.createAssignment).toHaveBeenCalledTimes(1);
    expect(mocks.createAssignment).toHaveBeenCalledWith({
      data: expect.objectContaining({ featureKey: 'LINE.DAILY_NOTIFICATION' }),
    });
    expect(mocks.createAudit).toHaveBeenCalledTimes(1);
  });

  it('does not write when the service has no enabled features', async () => {
    await assignEnabledServiceFeaturesToRegistrant(tx, input);

    expect(mocks.assignments).not.toHaveBeenCalled();
    expect(mocks.createAssignment).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });
});
