import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/20260916110000_add_fortune_core/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('fortune core migration', () => {
  it('keeps every new fortune service disabled until an operator enables it', () => {
    expect(migration).toMatch(/"enabled" BOOLEAN NOT NULL DEFAULT false/);
    expect(migration).toMatch(/"ai_enabled" BOOLEAN NOT NULL DEFAULT false/);
    expect(migration).toMatch(/"notification_enabled" BOOLEAN NOT NULL DEFAULT false/);
  });

  it('prevents a participant from drawing twice on the same local date', () => {
    expect(migration).toContain('"fortune_readings_service_participant_local_date_key"');
    expect(migration).toContain('("service_setting_id", "participant_id", "local_date")');
  });

  it('stores reviewed meanings by card, direction, and theme', () => {
    expect(migration).toContain('("knowledge_version_id", "card_code", "orientation", "theme")');
  });

  it('binds participants and readings to the same service tenant and user', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "group_membership_id", "user_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "participant_id", "member_user_id")',
    );
  });
});
