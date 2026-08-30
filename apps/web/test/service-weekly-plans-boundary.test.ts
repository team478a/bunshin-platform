import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/service-weekly-plans.ts', import.meta.url),
  'utf8',
);
const generation = readFileSync(
  new URL('../src/services/weekly-plan-generation.ts', import.meta.url),
  'utf8',
);
const detailPage = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);

describe('service weekly plan boundary', () => {
  it('derives service authority on the server', () => {
    expect(source).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(source).toContain('groupId: service.serviceId');
    expect(source).not.toContain('groupId: z.');
    expect(source).not.toContain('workspaceId: z.');
  });

  it('excludes personal knowledge and enables service-scoped campaigns', () => {
    expect(source).toContain('includeGrantedKnowledge: false');
    expect(source).toContain('includeCampaigns: true');
    expect(source).toContain('groupId: service.serviceId');
    expect(generation).toContain('input.includeGrantedKnowledge === false');
    expect(generation).toContain('input.includeCampaigns !== false');
  });

  it('connects generated-plan controls to the service endpoint', () => {
    expect(detailPage).toContain('<WeeklyPlanSection');
    expect(detailPage).toContain('/weekly-plans`}');
    expect(detailPage).toContain('managedGenerationOnly');
  });
});
