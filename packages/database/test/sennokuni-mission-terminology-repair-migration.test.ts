import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260921183000_repair_sennokuni_mission_terms/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Sennokuni mission terminology repair migration', () => {
  it('repairs existing mission text and variants only for Sennokuni Media', () => {
    expect(migration).toContain('configuration."slug" = \'sennokuni-media\'');
    expect(migration).toContain('UPDATE "daily_missions"');
    expect(migration).toContain('UPDATE "mission_contents"');
    expect(migration).toContain('UPDATE "mission_content_variants"');
    expect(migration).toContain("E'\\\\1ORI\\\\2'");
  });
});
