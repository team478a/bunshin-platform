import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260903090000_add_organization_entitlements/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('organization entitlement persistence', () => {
  it('keeps one current entitlement for each organization workspace', () => {
    expect(schema).toContain('model OrganizationEntitlement {');
    expect(schema).toMatch(/workspaceId\s+String\s+@unique/);
    expect(migration).toContain('"organization_entitlements_workspace_id_key"');
  });

  it('supports organization-wide capacity and feature controls', () => {
    for (const column of [
      'max_groups',
      'max_operators',
      'max_members',
      'max_services',
      'monthly_ai_generation_limit',
      'monthly_image_generation_limit',
      'monthly_video_generation_limit',
      'dedicated_line_enabled',
      'oem_enabled',
      'custom_domain_enabled',
      'suspended',
    ]) {
      expect(migration).toContain(`"${column}"`);
    }
  });

  it('records every change with an actor, reason and snapshots', () => {
    expect(migration).toContain('CREATE TABLE "organization_entitlement_audits"');
    expect(migration).toContain('"actor_user_id" UUID NOT NULL');
    expect(migration).toContain('"before_data" JSONB');
    expect(migration).toContain('"after_data" JSONB NOT NULL');
    expect(migration).toContain('"reason" VARCHAR(1000) NOT NULL');
  });

  it('rejects non-positive limits and invalid contract periods', () => {
    expect(migration).toContain('organization_entitlements_limits_check');
    expect(migration).toContain('"max_groups" >= 1');
    expect(migration).toContain('"starts_at" < "ends_at"');
  });
});
