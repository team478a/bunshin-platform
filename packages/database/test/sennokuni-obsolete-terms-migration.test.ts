import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260920173000_replace_sennokuni_obsolete_terms/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('千ノ国メディア旧名称の置換migration', () => {
  it('updates only the Sennokuni service onboarding and survey settings', () => {
    expect(migration).toContain(`configuration."slug" = 'sennokuni-media'`);
    expect(migration).toContain('"onboarding_config"');
    expect(migration).toContain('"survey_config"');
    expect(migration).toContain("'千ノ国メタバース'");
    expect(migration).toContain("'千ノ国メディア'");
  });
});
