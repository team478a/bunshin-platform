import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../prisma/migrations/20261104010000_enable_manaberu_public_training/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('Manaberu public training migration', () => {
  it('pins the service boundary and target program without touching other services', () => {
    expect(sql).toContain('sc."slug" = \'manaberu-style\'');
    expect(sql).toContain("'マナベルスタイル AI研修30日'");
    expect(sql).toContain('sp."status" = \'ACTIVE\'');
    expect(sql).toContain("sp.\"settings\"->>'moduleKey' = 'AI_TRAINING_V1'");
    expect(sql).toContain("target.workspace_id <> '74000000-0000-4000-8000-000000000001'");
    expect(sql).toContain("target.group_id <> 'ae9e96ca-16f3-4210-af4f-44d18bdaebe3'");
  });

  it('backfills bounded internal seats but never creates AI consent', () => {
    expect(sql).toContain("'internalParticipantCap', 100");
    expect(sql).toContain("'externalParticipantCap', 0");
    expect(sql).toContain("'PILOT_SEAT_V1:'");
    expect(sql).toContain('pe."status" = \'ACTIVE\'');
    expect(sql).toContain("pe.\"id\", 'INTERNAL', 'INTERNAL'");
    expect(sql).not.toMatch(/INSERT INTO "ai_training_usage_consents"/i);
    expect(sql).toContain("'aiConsentCreated', false");
  });

  it('enables only the versioned service setting and keeps training notifications stopped', () => {
    expect(sql).toContain("'SERVICE_TRAINING_AUTO_ADMISSION_V1'");
    expect(sql).toContain("'notificationsEnabled', false");
    expect(sql).toContain("'postponedReminderEnabled', false");
    expect(sql).toContain('Manaberu public training is partially configured');
    expect(sql).toContain('Manaberu public training has unexpected existing state');
  });
});
