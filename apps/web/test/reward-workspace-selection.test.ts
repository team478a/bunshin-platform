import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pointsPage = readFileSync(new URL('../app/(app)/points/page.tsx', import.meta.url), 'utf8');
const badgesPage = readFileSync(new URL('../app/(app)/badges/page.tsx', import.meta.url), 'utf8');

describe('reward workspace selection', () => {
  it.each([
    [pointsPage, '/points', 'このサービスのポイントを見る'],
    [badgesPage, '/badges', 'このサービスのバッジを見る'],
  ])('selects only from the signed-in user active workspaces', (source, action, button) => {
    expect(source).toContain('listActiveWorkspacesForUser(user.userId)');
    expect(source).toContain('workspaces.find(({ id }) => id === requestedWorkspaceId)');
    expect(source).toContain('workspaces.length > 1');
    expect(source).toContain(`action="${action}"`);
    expect(source).toContain('name="workspaceId"');
    expect(source).toContain(button);
  });
});
