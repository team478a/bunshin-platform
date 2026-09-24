import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) =>
  readFileSync(new URL(`../app/s/[serviceSlug]/manage/${name}`, import.meta.url), 'utf8');

describe('service management home module boundary', () => {
  it('keeps the route entry focused on loading and rendering the page model', () => {
    const page = source('page.tsx');

    expect(page).toContain('loadServiceManagementHome(serviceSlug)');
    expect(page).toContain('<ServiceManagementHomeView model={model} />');
    expect(page).not.toContain("import('@bunshin/database')");
    expect(page).not.toContain('<section');
  });

  it('keeps authentication and model assembly in the data module', () => {
    const data = source('service-management-home-data.ts');

    expect(data).toContain('currentUserProvider');
    expect(data).toContain('readServiceManagementHomeRecords');
    expect(data).not.toContain("import('@bunshin/database')");
  });

  it('keeps scoped database reads in the repository module', () => {
    const repository = source('service-management-home-repository.ts');

    expect(repository).toContain("import('@bunshin/database')");
    expect(repository).toContain('workspaceId');
    expect(repository).toContain('groupId: serviceId');
  });

  it('keeps presentation independent from authentication and database access', () => {
    const view = source('service-management-home-view.tsx');

    expect(view).toContain('ServiceManagementHomeModel');
    expect(view).toContain('<PublicShell');
    expect(view).not.toContain('currentUserProvider');
    expect(view).not.toContain('@bunshin/database');
  });
});
