import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const repository = readFileSync(
  new URL('../src/mission-content-variant-repository.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260907210000_add_mission_content_variants/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const qualityAuditMigration = readFileSync(
  new URL(
    '../prisma/migrations/20261002070000_add_mission_variant_quality_audit/migration.sql',
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
    expect(schema).toContain('qualityIssueCodes');
    expect(schema).toContain('qualityRepairCount');
    expect(qualityAuditMigration).toContain('"quality_issue_codes" TEXT[] NOT NULL');
    expect(qualityAuditMigration).toContain('"quality_repair_count" INTEGER NOT NULL');
  });

  it('rechecks workspace, Bunshin, user and service scope before every operation', () => {
    expect(repository).toContain('class PrismaMissionContentVariantRepository');
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('pg_advisory_xact_lock');
    expect(repository).toContain(
      "memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } }",
    );
    expect(repository).toContain('mission content variant limit reached');
    expect(repository).toContain('photo confirmation source is no longer current');
    expect(repository).toContain('MAX_PHOTO_FIRST_CONFIRMATION_VARIANTS');
    expect(repository).toContain('sequence: (latestVariant?.sequence ?? 0) + 1');
  });

  it('does not pass service-only scope fields into generation persistence', () => {
    expect(repository).not.toContain('missionContentVariantGeneration.create({ data: input })');
    expect(repository).toContain('idempotencyKey: input.idempotencyKey');
  });
});
