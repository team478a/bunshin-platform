import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260829080000_add_badge_reward_outbox/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('badge reward persistence invariants', () => {
  it('queues a badge award at most once', () => {
    expect(migration).toContain('badge_reward_links_badge_award_id_key');
    expect(migration).toContain('badge_reward_outbox_reward_link_id_key');
  });

  it('prevents cross-workspace and cross-user reward attachment', () => {
    expect(migration).toContain('badge_reward_links_award_scope_fkey');
    expect(migration).toContain('badge_reward_outbox_link_scope_fkey');
    expect(migration).toContain('badge_reward_entitlements_link_scope_fkey');
  });

  it('caps purpose-limited rewards and stores immutable cost policy', () => {
    expect(migration).toContain('badge_reward_entitlements_quantity_check');
    expect(migration).toContain('badge_reward_entitlements_cost_cap_check');
    expect(migration).toContain('badge_reward_entitlements_revocation_policy_check');
  });
});
