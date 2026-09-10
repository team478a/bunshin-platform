import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const videoListPage = readFileSync(
  new URL('../app/(app)/groups/[groupId]/videos/page.tsx', import.meta.url),
  'utf8',
);

describe('video list entitlement boundary', () => {
  it('lets image-plan members review carousel videos without exposing video-plan creation', () => {
    expect(videoListPage).toContain("available('VIDEO_GENERATION')");
    expect(videoListPage).toContain("available('SOCIAL.IMAGE_GENERATION')");
    expect(videoListPage).toContain(
      'if (!videoGenerationAvailable && !imageGenerationAvailable) notFound()',
    );
    expect(videoListPage).toContain(
      "videoGenerationAvailable ? '動画の企画と台本' : '作成した動画'",
    );
    expect(videoListPage).toContain('{videoGenerationAvailable ? (\n        <VideoProjectCreator');
  });
});
