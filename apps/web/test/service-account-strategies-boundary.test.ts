import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/service-account-strategies.ts', import.meta.url),
  'utf8',
);
const detailPage = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);

describe('service account strategy boundary', () => {
  it('derives service authority on the server', () => {
    expect(source).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(source).toContain('groupId: service.serviceId');
    expect(source).not.toContain('groupId: z.');
    expect(source).not.toContain('workspaceId: z.');
  });

  it('loads only the scoped Bunshin and social profile for generation', () => {
    expect(source).toContain('new GetBunshin(bunshins).execute(input)');
    expect(source).toContain('profiles.findByPlatform({');
    expect(source).toContain('...input,');
    expect(source).toContain('grantedKnowledge: serviceKnowledge.officialKnowledge');
    expect(source).toContain('loadServiceGenerationKnowledge');
  });

  it('connects the reusable strategy editor only to the service endpoint', () => {
    expect(detailPage).toContain('<AccountStrategySection');
    expect(detailPage).toContain('/social-account-strategies`}');
  });
});
