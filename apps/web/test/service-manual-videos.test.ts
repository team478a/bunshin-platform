import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('app/s/[serviceSlug]/manual-videos/page.tsx', 'utf8');
const navigation = readFileSync(
  'app/s/[serviceSlug]/home/service-home-navigation-sections.tsx',
  'utf8',
);

describe('service manual videos', () => {
  it('requires a signed-in service member and keeps the route inside the service context', () => {
    expect(page).toContain('resolveMemberServiceContext(slug, actorUserId)');
    expect(page).toContain('/login?returnTo=');
    expect(page).toContain(
      '!onboarding.businessProfileEnabled || !selectServiceMemberRoadmapPolicy(service)',
    );
  });

  it('lists the existing Hassy manuals with mobile-friendly playback', () => {
    expect(page).toContain('introduction-v1.mp4');
    expect(page).toContain('getting-started-v2.mp4');
    expect(page).toContain('controls playsInline preload="metadata"');
  });

  it('links the Hassy member home to the manual library', () => {
    expect(navigation).toContain('/manual-videos');
    expect(navigation).toContain('動画マニュアルを見る');
  });
});
