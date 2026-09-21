import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260921120000_add_training_skill_state/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('AI training skill state schema', () => {
  it('adds one scoped JSON projection to the existing participant profile', () => {
    expect(migration).toContain('ALTER TABLE "training_participant_profiles"');
    expect(migration).toContain('"skill_scores" JSONB NOT NULL');
    expect(migration).not.toContain('CREATE TABLE');
  });
});
