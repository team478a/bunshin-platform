import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260911200000_add_rewards_pilot_feature/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('rewards pilot feature migration', () => {
  it('registers a manageable points and badges feature without enabling members', () => {
    expect(migration).toContain("'REWARDS.POINTS_BADGES'");
    expect(migration).toContain("'ポイント・バッジ（試験利用）'");
    expect(migration).not.toContain('group_feature_policies');
    expect(migration).not.toContain('group_member_feature_assignments');
  });
});
