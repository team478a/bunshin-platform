import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const home = source('../app/s/[serviceSlug]/home/page.tsx');
const images = source('../app/s/[serviceSlug]/images/page.tsx');
const videos = source('../app/s/[serviceSlug]/videos/page.tsx');
const videoAssets = source('../app/s/[serviceSlug]/video-assets/page.tsx');
const videoDetail = source('../app/s/[serviceSlug]/videos/[videoProjectId]/page.tsx');

describe('service media entry boundary', () => {
  it('keeps image and video entry links inside the service URL', () => {
    expect(home).toContain('/s/${service.configuration.slug}/images');
    expect(home).toContain('/s/${service.configuration.slug}/videos');
    expect(home).not.toContain('href={`/groups/${groupId}/images`');
    expect(home).not.toContain('href={`/groups/${groupId}/videos`');
  });

  it.each([images, videos, videoAssets, videoDetail])(
    'resolves the server-owned service context before reusing media operations',
    (entry) => {
      expect(entry).toContain('resolvePublicServiceContext(serviceSlug)');
      expect(entry).toContain('groupId: service.serviceId');
      expect(entry).not.toContain('groupId: searchParams');
    },
  );

  it('keeps video list, assets and detail navigation in the service URL', () => {
    expect(videos).toContain('service: service.configuration.slug');
    expect(videoAssets).toContain('service: service.configuration.slug');
    expect(videoDetail).toContain('service: service.configuration.slug');
  });
});
