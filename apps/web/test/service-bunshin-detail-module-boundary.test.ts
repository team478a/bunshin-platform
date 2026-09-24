import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) =>
  readFileSync(
    new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${name}`, import.meta.url),
    'utf8',
  );

describe('service Bunshin detail module boundary', () => {
  it('keeps the route entry focused on metadata, loading and rendering', () => {
    const page = source('page.tsx');

    expect(page).toContain('loadServiceBunshinDetail');
    expect(page).toContain('<ServiceBunshinDetailView model={model} />');
    expect(page).not.toContain("import('@bunshin/database')");
    expect(page).not.toContain('<section');
  });

  it('keeps authentication and scoped member data assembly together', () => {
    const data = source('service-bunshin-detail-data.ts');

    expect(data).toContain('resolveAuthenticatedMemberServicePage');
    expect(data).toContain('workspaceId: service.workspaceId');
    expect(data).toContain('groupId: service.serviceId');
    expect(data).toContain('actorUserId: actor.userId');
  });

  it('keeps presentation independent from database and authentication access', () => {
    const view = source('service-bunshin-detail-view.tsx');

    expect(view).toContain('ServiceBunshinDetailModel');
    expect(view).toContain('<ServiceDailyMissionSection');
    expect(view).not.toContain('@bunshin/database');
    expect(view).not.toContain('resolveAuthenticatedMemberServicePage');
  });
});
