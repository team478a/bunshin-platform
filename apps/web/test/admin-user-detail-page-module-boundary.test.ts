import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(new URL(`../app/(app)/admin/users/[userId]/${file}`, import.meta.url), 'utf8');

describe('admin user detail page module boundary', () => {
  it('keeps the route focused on loading and rendering', () => {
    const page = read('page.tsx');
    expect(page).toContain('loadAdminUserDetailPageData');
    expect(page).toContain('<AdminUserDetailView data={data} query={query} />');
    expect(page).not.toContain("import('@bunshin/database')");
    expect(page).not.toContain("'use server'");
  });

  it('keeps authenticated mutations in a server action module', () => {
    const actions = read('admin-user-detail-actions.ts');
    expect(actions).toContain("'use server'");
    expect(actions).toContain('SetAdminUserStatus');
    expect(actions).toContain('SetAdminMetricExclusion');
    expect(actions).toContain('CreateAdminSupportCase');
    expect(actions).toContain('UpdateAdminSupportCase');
  });

  it('keeps repository loading separate from presentation sections', () => {
    const data = read('admin-user-detail-data.ts');
    const operations = read('admin-user-operation-sections.tsx');
    const summary = read('admin-user-summary-sections.tsx');
    expect(data).toContain("import('@bunshin/database')");
    expect(data).toContain('actorUserId: actor.userId');
    expect(operations).not.toContain("import('@bunshin/database')");
    expect(summary).not.toContain("import('@bunshin/database')");
  });
});
