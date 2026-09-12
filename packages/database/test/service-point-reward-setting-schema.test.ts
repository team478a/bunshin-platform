import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260912200000_add_service_point_reward_settings/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service point reward settings schema', () => {
  it('isolates one setting per service and reward type', () => {
    expect(schema).toContain('model ServicePointRewardSetting');
    expect(schema).toContain('@@unique([workspaceId, groupId, rewardType])');
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id")');
    expect(migration).toContain('"point_cost" > 0');
    expect(migration).toContain("\"status\" IN ('ACTIVE', 'SUSPENDED')");
  });
});
