import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260901010000_add_ai_character_profile_core/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
describe('AI character profile persistence', () => {
  it('keeps profile, license, prompt version, and private asset separate', () => {
    for (const model of [
      'AiCharacterProfile',
      'AiCharacterLicenseVersion',
      'AiCharacterProfileVersion',
      'AiCharacterReferenceAsset',
    ])
      expect(schema).toContain(`model ${model}`);
  });
  it('enforces ownership shape and one published version', () => {
    expect(migration).toContain('ai_character_profiles_owner_check');
    expect(migration).toContain('ai_character_profile_versions_published_key');
  });
  it('stores private object keys instead of public URLs', () => {
    expect(schema).toContain('storageKey');
    expect(schema).not.toContain('referenceImagePublicUrl');
  });
  it('adds service-scoped composite foreign keys', () => {
    expect(migration).toContain('profile_scope_fkey');
    expect(migration).toContain('version_scope_fkey');
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id", "character_profile_id")');
  });
});
