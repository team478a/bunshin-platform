import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20261017100000_personal_learning_topics_persona_examples/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('PR-D dynamic learning data boundaries', () => {
  it('scopes topics, persona facts and saved examples to the same service membership and user', () => {
    for (const model of [
      'PersonalLearningTopic',
      'PersonalLearningPersonaItem',
      'PersonalLearningSavedExample',
    ]) {
      const block = schema.split(`model ${model} {`)[1]?.split('\n}')[0];
      expect(block).toBeDefined();
      expect(block).toContain('workspaceId');
      expect(block).toContain('groupId');
      expect(block).toContain('groupMembershipId');
      expect(block).toContain('userId');
    }
  });

  it('adds the first topic from existing wishes without rewriting or deleting request history', () => {
    expect(migration).toContain('INSERT INTO personal_learning_topics');
    expect(migration).toContain('FROM personal_learning_requests');
    expect(migration).toContain('revision ASC');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+personal_learning_requests\b/i);
  });

  it('does not create a path from learner persona/example data into Bunshin Memory', () => {
    for (const model of [
      'PersonalLearningTopic',
      'PersonalLearningPersonaItem',
      'PersonalLearningSavedExample',
    ]) {
      const block = schema.split(`model ${model} {`)[1]?.split('\n}')[0] ?? '';
      expect(block).not.toContain('bunshinId');
      expect(block).not.toContain('BunshinMemory');
    }
    expect(migration).not.toContain('bunshin_memories');
  });
});
