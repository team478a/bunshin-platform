import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaBunshinMemoryRepository, PrismaOwnerBunshinMemoryRepository } from '../src/index';

describe('owner-only Bunshin memory repository', () => {
  it('does not let a workspace administrator read another owner memory', async () => {
    const findFirst = vi.fn(({ where }: { where: { ownerUserId?: string } }) =>
      Promise.resolve(
        where.ownerUserId
          ? null
          : {
              id: 'bunshin',
              ownerUserId: 'member',
              workspace: { memberships: [{ role: 'ADMIN' }] },
            },
      ),
    );
    const findMany = vi.fn().mockResolvedValue([]);
    const client = {
      bunshin: { findFirst },
      bunshinMemory: { findMany },
    } as unknown as PrismaClient;
    const scope = { workspaceId: 'workspace', bunshinId: 'bunshin', actorUserId: 'admin' };

    expect(await new PrismaBunshinMemoryRepository(client).list(scope)).toEqual([]);
    expect(findMany).toHaveBeenCalledOnce();
    findMany.mockClear();

    expect(await new PrismaOwnerBunshinMemoryRepository(client).list(scope)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ownerUserId: 'admin' }) }),
    );
  });
});
