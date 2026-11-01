import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaDailyMissionGenerationRepository } from '../src/daily-mission-generation-repository';
import { PrismaMissionContentVariantRepository } from '../src/mission-content-variant-repository';

const input = {
  workspaceId: 'workspace',
  bunshinId: 'bunshin',
  actorUserId: 'user',
  missionDate: '2026-11-02',
  idempotencyKey: 'request',
};
const at = new Date('2026-11-02T00:00:00Z');
function setup(status?: string) {
  const existing = { id: 'claim', ...input, status, generationTrigger: 'UNKNOWN', updatedAt: at };
  const generation = {
    create: vi
      .fn()
      .mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ id: 'claim', ...data }),
      ),
    findFirst: vi.fn().mockResolvedValue(existing),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ ...existing, generationTrigger: 'USER' }),
  };
  if (status)
    generation.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
  const bunshin = { findFirst: vi.fn().mockResolvedValue({ id: 'bunshin' }) };
  const repository = new PrismaDailyMissionGenerationRepository({
    dailyMissionGeneration: generation,
    bunshin,
  } as unknown as PrismaClient);
  return { repository, generation, bunshin };
}

describe('daily generation provenance', () => {
  it.each([null, '', 'PHOTO_FIRST', 'user'])(
    'rejects invalid variant origin %s before a transaction',
    async (generationTrigger) => {
      const transaction = vi.fn();
      const repository = new PrismaMissionContentVariantRepository({
        $transaction: transaction,
      } as unknown as PrismaClient);
      await expect(
        repository.claim({
          ...input,
          dailyMissionId: 'mission',
          generationTrigger,
        } as unknown as Parameters<typeof repository.claim>[0]),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['USER', 'SCHEDULER', 'SYSTEM', 'UNKNOWN'] as const)(
    'persists explicit %s origin',
    async (generationTrigger) => {
      const s = setup();
      expect(
        (await s.repository.claim({ ...input, generationTrigger })).record.generationTrigger,
      ).toBe(generationTrigger);
    },
  );

  it('defaults unspecified legacy callers to UNKNOWN', async () => {
    expect((await setup().repository.claim(input)).record.generationTrigger).toBe('UNKNOWN');
  });

  it.each([null, '', 'PHOTO_FIRST', 'user'])(
    'rejects invalid origin %s before DB access',
    async (generationTrigger) => {
      const s = setup();
      await expect(
        s.repository.claim({ ...input, generationTrigger } as unknown as Parameters<
          typeof s.repository.claim
        >[0]),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(s.bunshin.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['PENDING', 'COMPLETED'])(
    'does not relabel %s replay or legacy history',
    async (status) => {
      const s = setup(status);
      expect(await s.repository.claim({ ...input, generationTrigger: 'USER' })).toMatchObject({
        acquired: false,
        record: { generationTrigger: 'UNKNOWN' },
      });
      expect(s.generation.updateMany).not.toHaveBeenCalled();
    },
  );

  it('changes origin only when acquiring a new attempt after failure', async () => {
    const s = setup('FAILED');
    await s.repository.claim({ ...input, generationTrigger: 'USER' });
    expect(s.generation.updateMany).toHaveBeenCalledWith({
      where: { id: 'claim', status: 'FAILED', updatedAt: at },
      data: {
        status: 'PENDING',
        idempotencyKey: 'request',
        errorCategory: null,
        generationTrigger: 'USER',
      },
    });
  });

  it('rejects a retry that lost its compare-and-set without overwriting its origin', async () => {
    const s = setup('FAILED');
    s.generation.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.repository.claim({ ...input, generationTrigger: 'USER' })).rejects.toMatchObject(
      { code: 'CONFLICT' },
    );
    expect(s.generation.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
