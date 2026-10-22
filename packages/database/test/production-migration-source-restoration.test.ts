import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Read-only production evidence: migration names and hashes only; no application data.
const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/production-migration-checksums-20261022.json', import.meta.url),
    'utf8',
  ),
) as {
  productionCommit: string;
  records: Array<{
    name: string;
    observedChecksum: string;
    preRestorationChecksum: string;
    bodyChecksum: string;
  }>;
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

describe('restored production migration sources', () => {
  it('pins all sixteen mismatches observed on 2026-10-22 independently of current files', () => {
    expect(fixture.productionCommit).toBe('b96cea56083cb47632f565aab0b74b70bd612986');
    expect(fixture.records).toHaveLength(16);
    expect(new Set(fixture.records.map((record) => record.name)).size).toBe(16);
  });

  describe.each(fixture.records)('$name', (record) => {
    const sql = readFileSync(
      new URL(`../prisma/migrations/${record.name}/migration.sql`, import.meta.url),
      'utf8',
    ).replaceAll('\r\n', '\n');

    it('matches the applied production checksum, not the divergent main checksum', () => {
      expect(hash(sql)).toBe(record.observedChecksum);
      expect(hash(sql)).not.toBe(record.preRestorationChecksum);
    });

    it('restores transaction and timeout guards', () => {
      expect(sql).toMatch(/^BEGIN;$/m);
      expect(sql).toMatch(/^COMMIT;$/m);
      expect(sql).toMatch(/^SET LOCAL lock_timeout = '(5000ms|5s)';$/m);
      expect(sql).toMatch(/^SET LOCAL statement_timeout = '(60000ms|60s)';$/m);
      expect(sql).toMatch(/^SET LOCAL idle_in_transaction_session_timeout = '(60000ms|60s)';$/m);
    });

    it('preserves the pre-restoration DDL body and comments', () => {
      const body = sql
        .split('\n')
        .filter(
          (line) =>
            line.trim() &&
            !/^\s*(BEGIN;|COMMIT;|SET LOCAL (lock_timeout|statement_timeout|idle_in_transaction_session_timeout)\s*=.*;)\s*$/.test(
              line,
            ),
        )
        .join('\n');
      expect(hash(body)).toBe(record.bodyChecksum);
    });
  });
});
