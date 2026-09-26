import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaServiceLineBroadcastRecoveryRepository } from '../src';

const rows = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: 'workspace-1',
    updatedByUserId: 'user-1',
    scheduledAt: new Date('2026-09-26T04:00:00.000Z'),
    updatedAt: new Date('2026-09-26T04:01:00.000Z'),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    workspaceId: 'workspace-1',
    updatedByUserId: 'user-2',
    scheduledAt: new Date('2026-09-26T04:02:00.000Z'),
    updatedAt: new Date('2026-09-26T04:03:00.000Z'),
  },
];

describe('PrismaServiceLineBroadcastRecoveryRepository', () => {
  it('returns only scheduled broadcasts without an active or previously attempted recovery job', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        workspaceId: rows[1]!.workspaceId,
        broadcastId: rows[1]!.id,
        requestedBy: rows[1]!.updatedByUserId,
        scheduledAt: rows[1]!.scheduledAt,
        updatedAt: rows[1]!.updatedAt,
      },
    ]);
    const client = { $queryRaw: queryRaw } as unknown as PrismaClient;

    const result = await new PrismaServiceLineBroadcastRecoveryRepository(client).listUnqueued({
      environment: 'PRODUCTION',
      limit: 100,
    });

    expect(result).toEqual({
      candidates: [
        expect.objectContaining({ workspaceId: 'workspace-1', broadcastId: rows[1]!.id }),
      ],
      truncated: false,
    });
    expect(queryRaw).toHaveBeenCalledOnce();
    const sql = (queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(sql).toContain('workspace."status" = \'ACTIVE\'');
    expect(sql).toContain("job.\"status\" IN ('PENDING', 'LEASED', 'RETRY_SCHEDULED')");
    expect(sql).toContain('service-line-broadcast-recovery:');
    expect(queryRaw.mock.calls[0]?.slice(1)).toContain('PRODUCTION');
  });
});
