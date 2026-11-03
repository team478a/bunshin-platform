import { describe, expect, it, vi } from 'vitest';
import {
  productionManaberuAuditQueries,
  runProductionManaberuAudit,
} from '../scripts/production-manaberu-readonly-audit.mjs';

const project = 'vtkzinaudznwbsjoyszk';
const direct = `postgresql://postgres:synthetic@db.${project}.supabase.co:5432/postgres`;
const environment = {
  VERCEL_ENV: 'production',
  DATABASE_URL: direct,
  DIRECT_URL: direct,
  SUPABASE_SESSION_POOLER_HOST: 'aws-0-ap-northeast-1.pooler.supabase.com',
  MANABERU_AUDIT_EXPECTED_PROJECT_REF: project,
};

describe('production Manaberu read-only audit', () => {
  it('keeps every query scoped and excludes participant identifiers', () => {
    const sql = Object.values(productionManaberuAuditQueries).join('\n');
    expect(sql).toContain("slug = 'manaberu-style'");
    expect(sql).toContain("environment = 'PRODUCTION'");
    expect(sql).not.toMatch(/participant_hash|gm\.user_id|api_key_mask|encrypted_api_key\s+AS/i);
  });

  it('starts a read-only transaction and returns only aggregate audit output', async () => {
    type AuditTransaction = {
      $executeRawUnsafe(sql: string): Promise<unknown>;
      $queryRawUnsafe(sql: string): Promise<unknown>;
    };
    const execute = vi.fn<(sql: string) => Promise<unknown>>().mockResolvedValue(0);
    const query = vi.fn<(sql: string) => Promise<unknown>>().mockResolvedValue([]);
    const disconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const transaction = vi.fn(<T>(callback: (tx: AuditTransaction) => Promise<T>): Promise<T> =>
      callback({ $executeRawUnsafe: execute, $queryRawUnsafe: query }),
    );
    const connect = vi.fn().mockResolvedValue({
      $transaction: transaction,
      $disconnect: disconnect,
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runProductionManaberuAudit(environment, connect)).resolves.toBe(0);
    expect(execute.mock.calls[0]?.[0]).toBe('SET TRANSACTION READ ONLY');
    expect(query).toHaveBeenCalledTimes(5);
    expect(log.mock.calls.flat().join('\n')).toContain('database changes=none');
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('rejects a different project before connecting', async () => {
    const connect = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      runProductionManaberuAudit(
        { ...environment, MANABERU_AUDIT_EXPECTED_PROJECT_REF: 'abcdefghijklmnopqrst' },
        connect,
      ),
    ).resolves.toBe(1);
    expect(connect).not.toHaveBeenCalled();
  });
});
