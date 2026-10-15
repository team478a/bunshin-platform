import type { PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUPPORT_CASE_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

/** Deletes only resolved cases older than 90 days; their notes cascade with the case. */
export async function purgeExpiredSupportCases(
  client: PrismaClient,
  input: { now?: Date; limit?: number } = {},
) {
  const now = new Date(input.now ?? new Date());
  const limit = input.limit ?? DEFAULT_BATCH_SIZE;
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_BATCH_SIZE
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid support case retention input');

  const cutoff = new Date(now.getTime() - SUPPORT_CASE_RETENTION_DAYS * DAY_MS);
  return client.$transaction(
    async (tx) => {
      const expired = await tx.supportCase.findMany({
        where: { status: 'RESOLVED', resolvedAt: { lte: cutoff } },
        select: { id: true },
        orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      if (expired.length === 0) return { scanned: 0, deleted: 0, possiblyMore: false };

      const removed = await tx.supportCase.deleteMany({
        where: {
          id: { in: expired.map(({ id }) => id) },
          status: 'RESOLVED',
          resolvedAt: { lte: cutoff },
        },
      });
      return {
        scanned: expired.length,
        deleted: removed.count,
        possiblyMore: expired.length === limit,
      };
    },
    { timeout: 20_000 },
  );
}
