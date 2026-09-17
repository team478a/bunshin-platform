import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(
  new URL(
    '../prisma/migrations/20260917130000_set_sennokuni_prompt_only_images/migration.sql',
    import.meta.url,
  ),
);

describe('千ノ国メディアの画像プロンプト専用設定', () => {
  it('画像生成に関する利用権限、上限、交換、紹介特典を停止する', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain(`WHERE "slug" = 'sennokuni-media'`);
    expect(sql).toContain('UPDATE "group_feature_policies"');
    expect(sql).toContain('UPDATE "group_member_feature_assignments"');
    expect(sql).toContain(`"feature_key" = 'SOCIAL.IMAGE_GENERATION'`);
    expect(sql).toContain('"monthly_image_generation_limit" = 0');
    expect(sql).toContain('UPDATE "service_point_reward_settings"');
    expect(sql).toContain(`"reward_type" = 'SOCIAL_IMAGE_GENERATION'`);
    expect(sql).toContain('UPDATE "service_referral_reward_rules"');
    expect(sql).toContain(`"status" = 'SUSPENDED'`);
  });
});
