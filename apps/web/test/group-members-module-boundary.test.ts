import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) =>
  readFileSync(new URL(`../app/(app)/groups/[groupId]/members/${name}`, import.meta.url), 'utf8');

describe('group members module boundary', () => {
  it('keeps the route focused on loading and rendering', () => {
    const page = source('page.tsx');

    expect(page).toContain('loadGroupMembersPage');
    expect(page).toContain('<GroupMembersView model={model} />');
    expect(page).not.toContain("import('@bunshin/database')");
    expect(page).not.toContain('<section');
  });

  it('keeps manager authorization and workspace-scoped reads in the data module', () => {
    const data = source('group-members-data.ts');

    expect(data).toContain("role: 'MANAGER'");
    expect(data).toContain("status: 'ACTIVE'");
    expect(data).toContain('workspaceId: groupScope.workspaceId');
    expect(data).toContain('userId: actor.userId');
  });

  it('keeps presentation independent from database and authentication access', () => {
    const view = source('group-members-view.tsx');
    const features = source('group-member-feature-settings.tsx');

    expect(view).toContain('GroupMembersPageModel');
    expect(view).toContain('<GroupMemberFeatureSettings model={model} />');
    expect(features).toContain('saveMemberFeatureAssignment');
    expect(view).not.toContain('@bunshin/database');
    expect(view).not.toContain('currentUserProvider');
    expect(features).not.toContain('@bunshin/database');
  });
});
