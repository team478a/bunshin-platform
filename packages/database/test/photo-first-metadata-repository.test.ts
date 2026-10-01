import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(
  new URL('../src/mission-content-variant-repository.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261001103000_add_photo_first_variant_metadata/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Photo First metadata persistence boundary', () => {
  it('writes metadata in the same transaction as variant completion', () => {
    expect(repository).toContain('this.client.$transaction(async (tx) =>');
    expect(repository).toContain('tx.missionContentVariant.create');
    expect(repository).toContain('tx.missionContentVariantPhotoFirstMetadata.create');
    expect(repository).toContain('photoFirstMetadata: true');
  });

  it('enforces variant and source-photo tenant scope in the database', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "bunshin_id", "daily_mission_id", "variant_id")',
    );
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "bunshin_id", "photo_memory_id")');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).toContain('ON DELETE RESTRICT');
  });
});
