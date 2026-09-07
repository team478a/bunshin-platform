import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260907210000_add_mission_content_variants/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('mission content variant persistence boundary', () => {
  it('keeps the original daily mission unique while variants are append-only', () => {
    expect(schema).toContain('model MissionContentVariant');
    expect(schema).toContain('@@unique([workspaceId, bunshinId, dailyMissionId, sequence], map:');
    expect(schema).toContain('@@unique([workspaceId, bunshinId, missionDate])');
    expect(migration).toContain('"mission_content_variants_sequence_key"');
  });

  it('records generation outcomes and selection history separately', () => {
    expect(schema).toContain('model MissionContentVariantGeneration');
    expect(schema).toContain('model MissionContentVariantSelection');
    expect(schema).toContain('estimatedCostMicros');
    expect(migration).toContain('"MissionContentVariantGenerationStatus"');
  });

  it('rechecks workspace, Bunshin, user and service scope before every operation', () => {
    expect(repository).toContain('class PrismaMissionContentVariantRepository');
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('pg_advisory_xact_lock');
    expect(repository).toContain(
      "memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } }",
    );
    expect(repository).toContain('mission content variant limit reached');
  });
});
