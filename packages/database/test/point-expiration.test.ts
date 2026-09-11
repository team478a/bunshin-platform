import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/point-expiration.ts', import.meta.url)),
  'utf8',
);

describe('point expiration persistence boundaries', () => {
  it('expires only an unspent part and records it in the append-only ledger', () => {
    expect(source).toContain('SUM(consumption."amount")');
    expect(source).toContain('const remaining = grant.amount - used');
    expect(source).toContain("type: 'EXPIRE'");
    expect(source).toContain("sourceType: 'POINT_EXPIRATION'");
    expect(source).toContain('tx.pointConsumptionLink.create');
  });

  it('keeps the account nonnegative and makes retries idempotent', () => {
    expect(source).toContain('availablePoints: { gte: remaining }');
    expect(source).toContain('`expire:grant:${grant.id}`');
    expect(source).toContain("error.code === 'P2002' || error.code === 'P2034'");
    expect(source).toContain('Prisma.TransactionIsolationLevel.Serializable');
  });
});
