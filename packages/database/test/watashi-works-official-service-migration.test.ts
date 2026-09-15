import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260914090000_seed_watashi_works_official_service/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

const publicationMigration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260916083000_publish_watashi_works_official/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('Watashi Works official service seed', () => {
  it('creates the business project below the Watashi Works organization', () => {
    expect(migration).toContain("'運営団体ワタシワークス'");
    expect(migration).toContain("'企業向け'");
    expect(migration).toContain("'watashi-works-official'");
    expect(migration).toContain("'ワタシワークス公式'");
    expect(migration).toContain("'BUSINESS_DAILY_IDEAS'");
  });

  it('keeps launch private until legal and LINE readiness are complete', () => {
    expect(migration).toContain("'PRIVATE'");
    expect(migration).toMatch(/'PUBLIC',\s+false,\s+true,\s+false,\s+false,/);
    expect(migration).not.toContain('INSERT INTO "group_line_routing_policies"');
  });

  it('assigns the existing LINE operator explicitly at both organization and project scope', () => {
    expect(migration).toContain('INSERT INTO "workspace_memberships"');
    expect(migration).toContain("'OWNER'");
    expect(migration).toContain('INSERT INTO "group_memberships"');
    expect(migration).toContain("'SERVICE_OWNER'");
  });

  it('publishes public LINE registration when launch preparation is complete', () => {
    expect(publicationMigration).toContain('WHERE sc."slug" = \'watashi-works-official\'');
    expect(publicationMigration).toMatch(/"visibility"\s*=\s*'PUBLIC'/);
    expect(publicationMigration).toMatch(/"mode"\s*=\s*'PUBLIC'/);
    expect(publicationMigration).toMatch(/"line_enabled"\s*=\s*true/);
    expect(publicationMigration).toMatch(/"email_enabled"\s*=\s*false/);
    expect(publicationMigration).toMatch(/"invite_code_enabled"\s*=\s*false/);
    expect(publicationMigration).toContain(
      'Watashi Works official publication skipped: service configuration not found',
    );
    expect(publicationMigration).toContain('ワタシワークス公式をLINE登録導線で一般公開');
  });
});
