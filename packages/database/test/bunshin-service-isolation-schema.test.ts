import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260830190000_add_bunshin_service_scope/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Bunshin service isolation schema', () => {
  it('adds the nullable service scope without rewriting existing bunshins', () => {
    expect(migration).toContain('ADD COLUMN "group_id" UUID');
    expect(migration).not.toContain('ADD COLUMN "group_id" UUID NOT NULL');
    expect(migration).not.toMatch(/UPDATE\s+"bunshins"/i);
  });

  it('enforces the service relation inside the same workspace', () => {
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id")');
    expect(migration).toContain('REFERENCES "groups"("workspace_id", "id")');
  });
});
