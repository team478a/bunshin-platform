import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260918100000_add_ai_resale_runtime_persistence/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('AI resale runtime persistence', () => {
  it('stores capability-specific items without creating a parallel program runtime', () => {
    expect(migration).toContain('CREATE TABLE "resale_items"');
    expect(migration).not.toContain('CREATE TABLE "resale_actions"');
    expect(migration).not.toContain('CREATE TABLE "resale_events"');
    expect(migration).not.toContain('CREATE TABLE "resale_snapshots"');
  });

  it('extends the existing assignment and snapshot models for WAIT', () => {
    expect(migration).toContain('"action_mode" "ProgramActionMode"');
    expect(migration).toContain('"reason_code" VARCHAR(80)');
    expect(migration).toContain('"reevaluate_at" TIMESTAMPTZ(3)');
    expect(migration).toContain('"next_evaluation_at" TIMESTAMPTZ(3)');
    expect(migration).toContain('program_mission_assignments_wait_check');
  });

  it('binds an item to the enrollment membership and owner in the same tenant', () => {
    expect(migration).toContain('program_enrollments_scope_membership_key');
    expect(migration).toContain('resale_items_enrollment_membership_fkey');
    expect(migration).toContain('resale_items_membership_owner_fkey');
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id", "group_membership_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "owner_user_id")',
    );
  });

  it('protects lifecycle, concurrency and idempotency in the database', () => {
    expect(migration).toContain('resale_items_creation_idempotency_key');
    expect(migration).toContain('resale_items_lifecycle_check');
    expect(migration).toContain('resale_items_time_order_check');
    expect(migration).toContain('resale_items_revision_check');
  });

  it('enables row-level security for resale items', () => {
    expect(migration).toContain('ALTER TABLE "resale_items" ENABLE ROW LEVEL SECURITY');
  });
});
