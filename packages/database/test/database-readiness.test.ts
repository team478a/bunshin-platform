import type { PrismaClient } from '@prisma/client';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkDatabaseReadiness, LATEST_DATABASE_MIGRATION } from '../src/index';

describe('database readiness', () => {
  it('tracks the newest checked-in migration', () => {
    const migrations = readdirSync(join(process.cwd(), 'prisma', 'migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    expect(migrations.at(-1)).toBe(LATEST_DATABASE_MIGRATION);
  });

  it('reports ready only when the newest migration completed', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ applied: true }]);
    await expect(
      checkDatabaseReadiness({ $queryRaw: queryRaw } as unknown as PrismaClient),
    ).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('fails closed when the newest migration is missing', async () => {
    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ applied: false }]),
    } as unknown as PrismaClient;

    await expect(checkDatabaseReadiness(client)).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database schema is not current',
    });
  });
});
