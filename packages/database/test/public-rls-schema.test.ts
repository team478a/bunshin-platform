import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
const rlsBaseline = '20260909080000_enable_public_rls';

describe('public schema row-level security', () => {
  it('enables RLS on every existing public table', () => {
    const migration = readFileSync(join(migrationsRoot, rlsBaseline, 'migration.sql'), 'utf8');
    expect(migration).toContain("WHERE schemaname = 'public'");
    expect(migration).toContain('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY');
  });

  it('requires every later migration to enable RLS for each table it creates', () => {
    const laterMigrations = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name > rlsBaseline)
      .map((entry) => entry.name);

    for (const migrationName of laterMigrations) {
      const sql = readFileSync(join(migrationsRoot, migrationName, 'migration.sql'), 'utf8');
      const createdTables = [...sql.matchAll(/CREATE TABLE\s+"([^"]+)"/gi)].map(
        (match) => match[1]!,
      );
      for (const table of createdTables) {
        expect(sql, `${migrationName} must enable RLS on ${table}`).toMatch(
          new RegExp(`ALTER TABLE\\s+"${table}"\\s+ENABLE ROW LEVEL SECURITY`, 'i'),
        );
      }
    }
  });
});
