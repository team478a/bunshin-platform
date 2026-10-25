import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20261025120000_seed_hassy_public_service/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('HASSY public service seed', () => {
  it('keeps HASSY in its own service and workspace scope', () => {
    expect(migration).toContain("'hassy'");
    expect(migration).toContain("'ハッシー'");
    expect(migration).toContain("'運営団体ワタシワークス'");
    expect(migration).toContain("'PUBLIC'");
    expect(migration).not.toContain("'manaberu-style'");
    expect(migration).not.toContain('watashi-works-official');
  });

  it('enables public email registration without invitation approval', () => {
    expect(migration).toMatch(/'PUBLIC',\s*\n\s*true,\s*\n\s*true,\s*\n\s*false,\s*\n\s*false,/);
    expect(migration).toContain("'emailEnabled', true");
    expect(migration).toContain("'businessProfileInputMode', 'MINIMAL'");
    expect(migration).toContain('"included_member_limit"');
    expect(migration).toContain("'ハッシー無料テスト'");
  });

  it('does not depend on a hard-coded user identity', () => {
    expect(migration).toContain('pa."role" = \'SUPER_ADMIN\'');
    expect(migration).not.toContain('team478@gmail.com');
    expect(migration).not.toContain('27f3c535-45f7-4a04-aaa2-9e30f4ba71e5');
  });
});
