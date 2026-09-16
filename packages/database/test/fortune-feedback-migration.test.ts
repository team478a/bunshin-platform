import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../prisma/migrations/20260916170000_add_fortune_feedback/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('fortune feedback migration', () => {
  it('records first viewing and one selected feedback row per reading', () => {
    expect(sql).toContain('ADD COLUMN "first_viewed_at"');
    expect(sql).toContain('CREATE TABLE "fortune_feedback"');
    expect(sql).toContain('CREATE UNIQUE INDEX "fortune_feedback_reading_id_key"');
    expect(sql).toContain('ALTER TABLE "fortune_feedback" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('fortune_feedback_participant_scope_fkey');
    expect(sql).toContain('fortune_readings_feedback_scope_key');
    expect(sql).toContain(
      'FOREIGN KEY ("workspace_id", "group_id", "service_setting_id", "participant_id", "member_user_id", "reading_id")',
    );
    expect(sql).not.toContain('reading_text');
  });
});
