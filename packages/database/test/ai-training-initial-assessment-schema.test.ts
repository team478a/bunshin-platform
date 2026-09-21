import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260921090000_add_training_initial_assessment/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('AI training initial assessment schema', () => {
  it('stores only the minimum assessment state on the existing participant profile', () => {
    expect(schema).toContain('aiUseCases');
    expect(schema).toContain('workChallenges');
    expect(schema).toContain('preferredTopics');
    expect(schema).toContain('learningGoalKey');
    expect(schema).toContain('dailyMinutes');
  });

  it('constrains the supported daily learning duration', () => {
    expect(migration).toContain('training_participant_profiles_daily_minutes_check');
    expect(migration).toContain('CHECK ("daily_minutes" IN (5, 10, 15))');
  });
});
