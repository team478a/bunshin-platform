import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260830120000_add_service_foundation_core/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service foundation persistence', () => {
  it('uses the existing Group as the service boundary for every table', () => {
    expect(migration.match(/REFERENCES "groups"\("workspace_id", "id"\)/g)).toHaveLength(4);
    expect(migration).not.toContain('CREATE TABLE "services"');
  });

  it('allows only one configuration, brand and registration policy per Group', () => {
    expect(migration).toContain('"service_configurations_group_id_key"');
    expect(migration).toContain('"service_brands_group_id_key"');
    expect(migration).toContain('"service_registration_policies_group_id_key"');
  });

  it('rejects unsafe slugs, periods, URLs and colors at the database boundary', () => {
    expect(migration).toContain('service_configurations_slug_check');
    expect(migration).toContain('service_configurations_period_check');
    expect(migration).toContain('service_configurations_terms_url_check');
    expect(migration).toContain('service_configurations_privacy_url_check');
    expect(migration).toContain('service_brands_primary_color_check');
    expect(migration).toContain('service_brands_secondary_color_check');
  });

  it('keeps append-only configuration audit data', () => {
    expect(migration).toContain('CREATE TABLE "service_configuration_audits"');
    expect(migration).toContain('"before_data" JSONB');
    expect(migration).toContain('"after_data" JSONB NOT NULL');
    expect(migration).toContain('"performed_by_user_id" UUID NOT NULL');
  });
});
