import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(
  fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
  'utf8',
);
const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260911180000_add_point_issuance_emergency_stop/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const repository = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');

describe('point issuance emergency stop', () => {
  it('defaults existing and new services to normal issuance', () => {
    expect(schema).toContain(
      'pointIssuanceStopped Boolean                     @default(false) @map("point_issuance_stopped")',
    );
    expect(migration).toContain(
      'ADD COLUMN "point_issuance_stopped" BOOLEAN NOT NULL DEFAULT false',
    );
  });

  it('finishes stopped events without writing a point grant', () => {
    expect(repository).toContain('groupId = event.dailyMission.bunshin.groupId');
    expect(repository).toContain('if (pointControl?.pointIssuanceStopped)');
    expect(repository).toContain("failureCode: 'POINT_ISSUANCE_STOPPED'");
    expect(repository).toContain("return 'NO_ACTIVE_RULE'");
  });

  it('finishes grouped events when the participant is outside the rewards pilot', () => {
    expect(repository).toContain('hasActiveRewardsPilotAccess');
    expect(repository).toContain("failureCode: 'REWARDS_PILOT_UNAVAILABLE'");
    expect(repository).toContain("return 'NOT_ELIGIBLE'");
  });
});
