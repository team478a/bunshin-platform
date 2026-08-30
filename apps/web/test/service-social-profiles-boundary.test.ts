import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/service-social-profiles.ts', import.meta.url),
  'utf8',
);
const detailPage = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);

describe('service social profile boundary', () => {
  it('derives workspace and service IDs on the server', () => {
    expect(source).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(source).toContain('groupId: service.serviceId');
    expect(source).not.toContain('groupId: z.');
    expect(source).not.toContain('workspaceId: z.');
  });

  it('activates SOCIAL before creating the first service profile', () => {
    expect(source).toContain('new AssignCapabilityToBunshin(assignments).execute');
    expect(source).toContain("capabilityType: 'SOCIAL'");
    expect(source).toContain('new CreateSocialProfile(profiles, assignments).execute');
  });

  it('renders the reusable editor against a service-only endpoint', () => {
    expect(detailPage).toContain('<SocialProfileSection');
    expect(detailPage).toContain('/api/services/${encodeURIComponent');
    expect(detailPage).toContain('autoStart');
  });
});
