import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = join(process.cwd(), '..', '..');
const source = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

describe('organization project hierarchy', () => {
  it('keeps every project and public configuration under the same organization', () => {
    const schema = source('packages/database/prisma/schema.prisma');
    const repository = source('packages/database/src/service-foundation.ts');

    expect(schema).toContain(
      'workspace                       Workspace                        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)',
    );
    expect(schema).toContain(
      'group                Group                       @relation(fields: [workspaceId, groupId], references: [workspaceId, id], onDelete: Cascade)',
    );
    expect(repository).toContain(
      "where: { id: input.workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' }",
    );
  });

  it('shows project managers their parent organization without granting organization management', () => {
    const page = source('apps/web/app/(app)/organizations/page.tsx');

    expect(page).toContain('groupMembership.findMany');
    expect(page).toContain("accessLabel: 'プロジェクト運営者'");
    expect(page).toContain('canManageOrganization: false');
    expect(page).toContain('{organization.canManageOrganization ? (');
  });

  it('labels system, organization, project and public settings as separate responsibilities', () => {
    const shell = source('apps/web/app/ui/app-shell.tsx');
    const organizations = source('apps/web/app/(app)/admin/organizations/page.tsx');

    expect(shell).toContain('<strong>ワタシワークス全体</strong>');
    expect(shell).toContain("{ href: '/admin/groups', label: 'プロジェクト管理' }");
    expect(shell).toContain("{ href: '/admin/services', label: '公開設定' }");
    expect(organizations).toContain('各プロジェクトは必ず運営団体');
  });
});
