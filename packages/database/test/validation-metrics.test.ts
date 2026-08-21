import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaValidationMetricsRepository } from '../src';

const period = {
  from: new Date('2026-08-01T00:00:00.000Z'),
  to: new Date('2026-09-01T00:00:00.000Z'),
};

describe('PrismaValidationMetricsRepository authorization', () => {
  it('returns null before reading metrics when OWNER/ADMIN access is absent', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findActivities = vi.fn();
    const findPosts = vi.fn();
    const client = {
      workspaceMembership: { findFirst },
      missionActivity: { findMany: findActivities },
      postRecord: { findMany: findPosts },
    } as unknown as PrismaClient;

    await expect(
      new PrismaValidationMetricsRepository(client).summarize({
        workspaceId: 'other-workspace',
        actorUserId: 'member-or-outsider',
        period,
      }),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'other-workspace',
        userId: 'member-or-outsider',
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
        workspace: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    expect(findActivities).not.toHaveBeenCalled();
    expect(findPosts).not.toHaveBeenCalled();
  });
});
