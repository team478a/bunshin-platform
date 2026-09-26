import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) =>
  readFileSync(new URL(`../app/(app)/groups/[groupId]/badges/${name}`, import.meta.url), 'utf8');

describe('group badges module boundary', () => {
  it('keeps the route focused on loading and rendering', () => {
    const page = source('page.tsx');

    expect(page).toContain('loadGroupBadgesPage');
    expect(page).toContain('<GroupBadgesView model={model} />');
    expect(page).not.toContain("import('@bunshin/database')");
    expect(page).not.toContain('<section');
  });

  it('keeps active manager authorization and scoped reads in the data module', () => {
    const data = source('group-badges-data.ts');

    expect(data).toContain("role: 'MANAGER'");
    expect(data).toContain("status: 'ACTIVE'");
    expect(data).toContain('workspaceId: group.workspaceId');
    expect(data).toContain('groupId: group.id');
  });

  it('keeps writes in server actions and presentation free of database access', () => {
    const actions = source('group-badge-actions.ts');
    const view = source('group-badges-view.tsx');

    expect(actions).toContain("'use server'");
    expect(actions).toContain('CreateAndSubmitGroupBadge');
    expect(view).toContain('GroupBadgesPageModel');
    expect(view).not.toContain('@bunshin/database');
    expect(view).not.toContain('currentUserProvider');
  });
});
