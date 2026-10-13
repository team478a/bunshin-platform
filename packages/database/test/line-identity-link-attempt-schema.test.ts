import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('explicit LINE identity-link attempt migration', () => {
  it('adds a distinct single-use attempt method without changing prior migrations', () => {
    const enumSql = readFileSync(
      new URL(
        '../prisma/migrations/20261014090000_add_line_link_attempt_method/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const constraintSql = readFileSync(
      new URL(
        '../prisma/migrations/20261014091000_allow_line_link_attempt_method/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(enumSql).toContain('ALTER TYPE "AuthReturnAttemptMethod" ADD VALUE \'LINE_LINK\'');
    expect(constraintSql).toContain("\"method\" IN ('LINE', 'LINE_LINK')");
    expect(constraintSql).toContain('"login_identity_hash" IS NULL');
  });
});
