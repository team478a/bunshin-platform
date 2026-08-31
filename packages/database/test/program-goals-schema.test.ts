import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260831230000_add_program_goals_core/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('program goals persistence boundary', () => {
  it('stores policy, preference, reusable definition, and member goal separately', () => {
    for (const model of [
      'ServiceProgramSupportPolicy',
      'ProgramMemberPreference',
      'ProgramGoalDefinition',
      'ProgramMemberGoal',
    ])
      expect(schema).toContain(`model ${model}`);
  });

  it('uses workspace and service composite foreign keys', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "program_enrollment_id")',
    );
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id", "service_program_id")');
    expect(migration).toContain('service_program_support_policies_active_key');
    expect(migration).toContain('program_member_goals_active_key');
  });

  it('keeps preference goals separate from outcome categories', () => {
    expect(schema).toContain('ACTION');
    expect(schema).toContain('TRAFFIC');
    expect(schema).toContain('BUSINESS');
    expect(schema).not.toContain('ProgramGoalMetricType {\n  REVENUE_GUARANTEE');
  });
});
