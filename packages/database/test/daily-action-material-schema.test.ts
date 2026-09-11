import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260912153000_add_daily_action_materials/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Daily Action material schema', () => {
  it('stores private photo metadata on owner-scoped Bunshin memories', () => {
    expect(migration).toContain('"attachment_storage_key"');
    expect(migration).toContain('"attachment_status"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "bunshin_memories_attachment_storage_key_key"',
    );
    expect(migration).toContain('"workspace_id", "bunshin_id", "source_type", "source_id"');
  });
});
