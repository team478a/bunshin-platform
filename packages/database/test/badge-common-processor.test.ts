import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/badge-common-processor.ts', import.meta.url)),
  'utf8',
);

describe('common badge processor boundaries', () => {
  it('reads only approved objective activity sources', () => {
    for (const table of [
      'bunshins',
      'social_account_strategies',
      'mission_activities',
      'mission_decisions',
      'post_records',
      'mission_feedback',
      'social_image_generated_media',
    ])
      expect(source).toContain(`"${table}"`);
  });

  it('requires workspace and user ownership when accepting source events', () => {
    expect(source).toContain('sourceMatches');
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('actorUserId: input.userId');
    expect(source).toContain('ownerUserId: input.userId');
  });

  it('keeps rewards disabled and stores hashes instead of content copies', () => {
    expect(source).toContain("rewardPolicy: { type: 'NONE' }");
    expect(source).toContain("createHash('sha256')");
    expect(source).not.toContain('contentJson');
    expect(source).not.toContain('personalitySummary');
  });
});
