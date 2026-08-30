import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/service-content-pillars.ts', import.meta.url),
  'utf8',
);
const detailPage = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);

describe('service content pillar boundary', () => {
  it('derives service authority on the server', () => {
    expect(source).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(source).toContain('groupId: service.serviceId');
    expect(source).not.toContain('groupId: z.');
    expect(source).not.toContain('workspaceId: z.');
  });

  it('activates SOCIAL before creating the first theme', () => {
    expect(source).toContain('new AssignCapabilityToBunshin(assignments).execute');
    expect(source).toContain("capabilityType: 'SOCIAL'");
    expect(source).toContain('new CreateContentPillar(pillars, assignments).execute');
  });

  it('connects the reusable editor only to the service endpoint', () => {
    expect(detailPage).toContain('<ContentPillarSection');
    expect(detailPage).toContain('/content-pillars`}');
    expect(detailPage).toContain('autoStart');
  });
});
