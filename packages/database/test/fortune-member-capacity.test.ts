import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('fortune limited-release capacity', () => {
  it('backfills a free 100-participant service limit without overwriting existing contracts', () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          '../prisma/migrations/20260916180000_add_fortune_member_capacity/migration.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );

    expect(sql).toContain('"included_member_limit"');
    expect(sql).toMatch(/'FREE'::"ServiceBillingMode"[\s\S]*100/);
    expect(sql).toMatch(/WHERE NOT EXISTS[\s\S]*"service_commercial_settings"/);
  });
});
