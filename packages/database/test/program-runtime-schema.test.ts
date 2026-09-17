import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260917150000_add_program_runtime_tracking/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('program runtime persistence', () => {
  it('stores assignments, append-only events and recalculable progress', () => {
    expect(migration).toContain('CREATE TABLE "program_mission_assignments"');
    expect(migration).toContain('CREATE TABLE "program_action_events"');
    expect(migration).toContain('CREATE TABLE "program_progress_snapshots"');
    expect(migration).not.toContain('UPDATE "program_action_events"');
  });

  it('prevents duplicate sequence and duplicate source processing', () => {
    expect(migration).toContain('"program_mission_assignments_enrollment_sequence_key"');
    expect(migration).toContain('"program_action_events_idempotency_key"');
  });

  it('enforces tenant boundaries with composite foreign keys', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "mission_assignment_id")',
    );
    expect(migration).not.toContain('ON DELETE CASCADE');
  });

  it('keeps assignment lifecycle timestamps consistent', () => {
    expect(migration).toContain('program_mission_assignments_status_time_check');
    expect(migration).toContain('program_mission_assignments_target_check');
    expect(migration).toContain('program_action_events_source_check');
  });

  it('enables row-level security for every runtime table', () => {
    expect(migration).toContain(
      'ALTER TABLE "program_mission_assignments" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain('ALTER TABLE "program_action_events" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain(
      'ALTER TABLE "program_progress_snapshots" ENABLE ROW LEVEL SECURITY',
    );
  });
});
