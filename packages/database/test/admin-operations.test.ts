import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaAdminOperationsRepository } from '../src';

describe('PrismaAdminOperationsRepository', () => {
  it('does not query user data for a non administrator', async () => {
    const findMany = vi.fn();
    const client = {
      platformAdmin: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findMany, findUnique: vi.fn() },
    } as unknown as PrismaClient;
    const repository = new PrismaAdminOperationsRepository(client);
    await expect(
      repository.snapshot({
        actorUserId: crypto.randomUUID(),
        environment: 'PRODUCTION',
        from: new Date('2026-08-01T00:00:00Z'),
        to: new Date('2026-09-01T00:00:00Z'),
        query: '',
        limit: 100,
      }),
    ).resolves.toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });
});
