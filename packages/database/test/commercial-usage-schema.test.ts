import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260918130000_add_oem_commercial_usage/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('OEM commercial usage schema', () => {
  it('keeps billable events tenant-scoped and idempotent', () => {
    expect(migration).toContain('CREATE TABLE "service_usage_events"');
    expect(migration).toContain(
      'UNIQUE INDEX "service_usage_events_workspace_id_idempotency_key_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")',
    );
  });

  it('stores immutable monthly billing evidence', () => {
    expect(migration).toContain('CREATE TABLE "tenant_monthly_usage"');
    expect(migration).toContain('"status" "TenantMonthlyUsageStatus"');
    expect(migration).toContain('"calculated_price_yen" INTEGER');
    expect(migration).toContain('tenant_monthly_usage_finalized_at');
    expect(migration).toContain('tenant_monthly_usage_immutable');
  });
});
