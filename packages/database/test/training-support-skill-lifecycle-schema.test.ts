import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261005030000_training_support_skill_lifecycle/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const repository = readFileSync(
  new URL('../src/training-support-skill-lifecycle.ts', import.meta.url),
  'utf8',
);

describe('AI training support skill lifecycle persistence boundary', () => {
  it('uses package-specific Service-owned tables and no participant or Bunshin owner', () => {
    expect(schema).toContain('model TrainingSupportSkill {');
    expect(schema).toContain('model TrainingSupportSkillVersion {');
    expect(schema).toContain('model TrainingSupportSkillActivation {');
    expect(migration).toContain('"training_support_skills_scope_key"');
    expect(migration).not.toContain('bunshin_id');
    expect(migration).not.toContain('program_enrollment_id');
  });

  it('binds every history row to the same workspace, service and skill', () => {
    expect(migration).toContain('"training_support_skill_versions_skill_fkey"');
    expect(migration).toContain('"training_support_skill_activations_skill_fkey"');
    expect(migration).toContain('"training_support_skills_current_version_fkey"');
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "training_support_skill_id", "skill_version_id")',
    );
  });

  it('enforces CAS, idempotency, immutable versions and append-only audit', () => {
    expect(migration).toContain('"training_support_skill_activations_idempotency_key"');
    expect(migration).toContain('"training_support_skill_activations_revision_check"');
    expect(migration).toContain('"training_support_skill_versions_immutable_trigger"');
    expect(migration).toContain('"training_support_skill_activations_append_only_trigger"');
    expect(migration).toContain('"training_support_skill_versions_one_active_key"');
    expect(repository).toContain("isolationLevel: 'Serializable'");
    expect(repository).toContain('revision: input.previousRevision');
  });

  it('stores all-PASSED rollback evidence and rejects UNKNOWN at the database boundary', () => {
    expect(schema).toContain('rollbackCompatibility');
    expect(migration).toContain('"training_support_skill_activations_rollback_check"');
    for (const axis of [
      'PROGRAM_VERSION',
      'MISSION',
      'LEARNING_OBJECTIVE',
      'ASSIGNMENT_VARIANT',
      'VALIDATION_POLICY',
    ])
      expect(migration).toContain(`"${axis}":"PASSED"`);
  });

  it('does not add an API, UI, Provider, delivery or exposure event', () => {
    expect(repository).not.toContain('fetch(');
    expect(repository).not.toContain('Provider');
    expect(migration).not.toContain('TRAINING_SUPPORT_SKILL_PRESENTED');
  });
});
