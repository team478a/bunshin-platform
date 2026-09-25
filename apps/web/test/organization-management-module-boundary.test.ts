import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) =>
  readFileSync(
    new URL(`../app/(app)/organizations/[workspaceId]/manage/${name}`, import.meta.url),
    'utf8',
  );

describe('organization management module boundary', () => {
  it('keeps the route focused on loading and rendering', () => {
    const page = source('page.tsx');

    expect(page).toContain('loadOrganizationManagePage');
    expect(page).toContain('<OrganizationManageView model={model} />');
    expect(page).not.toContain("import('@bunshin/database')");
    expect(page).not.toContain('<section');
  });

  it('keeps organization manager authorization and scoped reads outside the view', () => {
    const access = source('organization-manager-access.ts');
    const data = source('organization-manage-data.ts');

    expect(access).toContain("role: { in: ['OWNER', 'ADMIN'] }");
    expect(access).toContain("status: 'ACTIVE'");
    expect(data).toContain("type: 'ORGANIZATION'");
    expect(data).toContain('id: workspaceId.data');
  });

  it('keeps writes in server actions and presentation free of database access', () => {
    const actions = source('organization-manage-actions.ts');
    const view = source('organization-manage-view.tsx');

    expect(actions).toContain("'use server'");
    expect(actions).toContain('createOperatorInvitation');
    expect(actions).toContain('PrismaGroupParticipationRepository');
    expect(view).toContain('OrganizationManagePageModel');
    expect(view).not.toContain('@bunshin/database');
    expect(view).not.toContain('currentUserProvider');
  });
});
