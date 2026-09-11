import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  PointBalanceReconciliationRepository,
  PointBalanceReconciliationResult,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

interface PointBalanceRow {
  accountId: string;
  workspaceId: string;
  userId: string;
  storedBalance: number;
  ledgerBalance: bigint;
  mismatchCount: bigint;
  revision: number;
}

function safeNumber(value: bigint, field: string) {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new Error(`${field} exceeds safe integer range`);
  return converted;
}

export class PrismaPointBalanceReconciliationRepository implements PointBalanceReconciliationRepository {
  constructor(private readonly client: PrismaClient) {}

  async inspect(input: { limit: number }): Promise<PointBalanceReconciliationResult> {
    const [accountsChecked, rows] = await Promise.all([
      this.client.pointAccount.count(),
      this.client.$queryRaw<PointBalanceRow[]>(Prisma.sql`
        WITH balances AS (
          SELECT
            account."id" AS "accountId",
            account."workspace_id" AS "workspaceId",
            account."user_id" AS "userId",
            account."available_points" AS "storedBalance",
            account."revision" AS "revision",
            COALESCE(SUM(ledger."amount"), 0)::bigint AS "ledgerBalance"
          FROM "point_accounts" account
          LEFT JOIN "point_transactions" ledger
            ON ledger."account_id" = account."id"
          GROUP BY
            account."id",
            account."workspace_id",
            account."user_id",
            account."available_points",
            account."revision"
        )
        SELECT balances.*, COUNT(*) OVER() AS "mismatchCount"
        FROM balances
        WHERE balances."storedBalance"::bigint <> balances."ledgerBalance"
        ORDER BY balances."workspaceId" ASC, balances."accountId" ASC
        LIMIT ${input.limit}
      `),
    ]);
    const mismatches = rows.map((row) => {
      const ledgerBalance = safeNumber(row.ledgerBalance, 'ledger balance');
      return {
        accountId: row.accountId,
        workspaceId: row.workspaceId,
        userId: row.userId,
        storedBalance: row.storedBalance,
        ledgerBalance,
        difference: row.storedBalance - ledgerBalance,
        revision: row.revision,
      };
    });
    return {
      accountsChecked,
      mismatchCount: rows[0] ? safeNumber(rows[0].mismatchCount, 'mismatch count') : 0,
      mismatches,
    };
  }

  async repair(input: {
    accountId: string;
    workspaceId: string;
    userId: string;
    actorUserId: string;
    expectedStoredBalance: number;
    expectedLedgerBalance: number;
    expectedRevision: number;
    reason: string;
  }) {
    return this.client.$transaction(
      async (tx) => {
        const admin = await tx.platformAdmin.findFirst({
          where: { userId: input.actorUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
          select: { id: true },
        });
        if (!admin)
          throw new ApplicationError('FORBIDDEN', 'point balance repair requires super admin');
        const account = await tx.pointAccount.findFirst({
          where: {
            id: input.accountId,
            workspaceId: input.workspaceId,
            userId: input.userId,
          },
          select: { id: true, availablePoints: true, revision: true },
        });
        if (!account) return null;
        const ledger = await tx.pointTransaction.aggregate({
          where: {
            accountId: input.accountId,
            workspaceId: input.workspaceId,
            userId: input.userId,
          },
          _sum: { amount: true },
        });
        const ledgerBalance = ledger._sum.amount ?? 0;
        if (
          account.availablePoints !== input.expectedStoredBalance ||
          account.revision !== input.expectedRevision ||
          ledgerBalance !== input.expectedLedgerBalance ||
          ledgerBalance < 0 ||
          account.availablePoints === ledgerBalance
        )
          throw new ApplicationError('CONFLICT', 'point balance repair conflict');
        const changed = await tx.pointAccount.updateMany({
          where: {
            id: input.accountId,
            workspaceId: input.workspaceId,
            userId: input.userId,
            availablePoints: input.expectedStoredBalance,
            revision: input.expectedRevision,
          },
          data: { availablePoints: ledgerBalance, revision: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ApplicationError('CONFLICT', 'point balance repair conflict');
        await tx.pointBalanceRepairAudit.create({
          data: {
            accountId: input.accountId,
            workspaceId: input.workspaceId,
            userId: input.userId,
            previousBalance: account.availablePoints,
            repairedBalance: ledgerBalance,
            ledgerBalance,
            reason: input.reason,
            performedByUserId: input.actorUserId,
          },
        });
        return {
          accountId: input.accountId,
          previousBalance: account.availablePoints,
          repairedBalance: ledgerBalance,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
