import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/point-balance-reconciliation.ts', import.meta.url)),
  'utf8',
);

describe('point balance reconciliation persistence boundaries', () => {
  it('compares every account with its complete append-only ledger', () => {
    expect(source).toContain('LEFT JOIN "point_transactions"');
    expect(source).toContain('COALESCE(SUM(ledger."amount"), 0)');
    expect(source).toContain('"storedBalance"::bigint <> balances."ledgerBalance"');
    expect(source).toContain('this.client.pointAccount.count()');
  });

  it('bounds the returned details while preserving the total mismatch count', () => {
    expect(source).toContain('COUNT(*) OVER() AS "mismatchCount"');
    expect(source).toContain('LIMIT ${input.limit}');
  });
});
