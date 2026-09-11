import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('business free content migration', () => {
  it('adds profile facts, weekly categories and upgrades existing business delivery', () => {
    const migration = readFileSync(
      new URL(
        '../prisma/migrations/20260912100000_business_free_content_completion/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(migration).toContain('"business_features"');
    expect(migration).toContain('"business_content_category"');
    expect(migration).toContain('\'"READY_TO_USE"\'::jsonb');
  });
});
