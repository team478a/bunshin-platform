import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260831180000_add_program_foundation_core/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('program foundation persistence', () => {
  it('stores immutable template, offering and enrollment snapshots', () => {
    expect(migration).toContain('CREATE TABLE "program_template_versions"');
    expect(migration).toContain('"terms_snapshot" JSONB NOT NULL');
    expect(migration).toContain('"offering_snapshot" JSONB NOT NULL');
    expect(migration).not.toContain('ON DELETE CASCADE');
  });

  it('enforces workspace and service isolation with composite foreign keys', () => {
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id", "group_membership_id")');
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id", "service_program_id")');
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id", "program_offering_id")');
  });

  it('keeps program changes in an append-only audit resource', () => {
    expect(migration).toContain('CREATE TABLE "program_audit_logs"');
    expect(migration).toContain('"before_data" JSONB');
    expect(migration).toContain('"after_data" JSONB NOT NULL');
    expect(migration).toContain('"performed_by_user_id" UUID NOT NULL');
  });

  it('does not introduce checkout, rewards or revenue sharing', () => {
    expect(migration).not.toMatch(/checkout|commission|revenue_share|payment_transaction/i);
  });
});
