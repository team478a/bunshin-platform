import { vi } from 'vitest';

type Stage = 'PENDING' | 'CLAIMED' | 'AUTHENTICATED' | 'CONSUMED';
export interface AttemptRow {
  id: string;
  proofHash: string;
  method: 'LINE' | 'EMAIL';
  stage: Stage;
  origin: string;
  returnPath: string | null;
  pkceFlowId: string | null;
  loginIdentityHash: string | null;
  actorUserId: string | null;
  expiresAt: Date;
  createdAt: Date;
}
interface Where {
  id?: string | { in: string[] };
  proofHash?: string;
  origin?: string;
  stage?: Stage | { not: Stage };
  method?: 'LINE' | 'EMAIL';
  actorUserId?: string;
  expiresAt?: { gt?: Date; lt?: Date };
}
export const attemptRows = new Map<string, AttemptRow>();

function matches(row: AttemptRow, where: Where) {
  return (
    (!where.id ||
      (typeof where.id === 'string' ? row.id === where.id : where.id.in.includes(row.id))) &&
    (!where.proofHash || row.proofHash === where.proofHash) &&
    (!where.origin || row.origin === where.origin) &&
    (!where.method || row.method === where.method) &&
    (!where.actorUserId || row.actorUserId === where.actorUserId) &&
    (!where.stage ||
      (typeof where.stage === 'string'
        ? row.stage === where.stage
        : row.stage !== where.stage.not)) &&
    (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt) &&
    (!where.expiresAt?.lt || row.expiresAt < where.expiresAt.lt)
  );
}

export const attemptTable = {
  create: vi.fn(
    ({
      data,
    }: {
      data: Partial<AttemptRow> &
        Pick<AttemptRow, 'id' | 'proofHash' | 'method' | 'origin' | 'expiresAt' | 'createdAt'>;
    }) => {
      const row: AttemptRow = {
        stage: 'PENDING',
        returnPath: null,
        pkceFlowId: null,
        loginIdentityHash: null,
        actorUserId: null,
        ...data,
      };
      attemptRows.set(row.id, row);
      return Promise.resolve({ ...row });
    },
  ),
  findUnique: vi.fn(({ where }: { where: { id: string } }) => {
    const row = attemptRows.get(where.id);
    return Promise.resolve(row ? { ...row } : null);
  }),
  findMany: vi.fn(({ where, take }: { where: Where; take?: number }) =>
    Promise.resolve(
      [...attemptRows.values()]
        .filter((row) => matches(row, where))
        .slice(0, take)
        .map((row) => ({ ...row })),
    ),
  ),
  updateMany: vi.fn(({ where, data }: { where: Where; data: Partial<AttemptRow> }) => {
    let count = 0;
    for (const row of attemptRows.values())
      if (matches(row, where)) {
        Object.assign(row, data);
        count += 1;
      }
    return Promise.resolve({ count });
  }),
  deleteMany: vi.fn(({ where }: { where: Where }) => {
    let count = 0;
    for (const row of attemptRows.values())
      if (matches(row, where)) {
        attemptRows.delete(row.id);
        count += 1;
      }
    return Promise.resolve({ count });
  }),
};
