import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  PointBalanceReconciliationRepository,
  PointBalanceReconciliationResult,
} from '@bunshin/application';

interface PointBalanceRow {
  accountId: string;
  workspaceId: string;
  userId: string;
  storedBalance: number;
  ledgerBalance: bigint;
  mismatchCount: bigint;
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
            COALESCE(SUM(ledger."amount"), 0)::bigint AS "ledgerBalance"
          FROM "point_accounts" account
          LEFT JOIN "point_transactions" ledger
            ON ledger."account_id" = account."id"
          GROUP BY
            account."id",
            account."workspace_id",
            account."user_id",
            account."available_points"
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
      };
    });
    return {
      accountsChecked,
      mismatchCount: rows[0] ? safeNumber(rows[0].mismatchCount, 'mismatch count') : 0,
      mismatches,
    };
  }
}
