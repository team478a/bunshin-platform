import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const importer = readFileSync(
  fileURLToPath(new URL('../src/http/group-badge-import.ts', import.meta.url)),
  'utf8',
);
const groupPage = readFileSync(
  fileURLToPath(new URL('../app/(app)/groups/[groupId]/badges/page.tsx', import.meta.url)),
  'utf8',
);
const adminPage = readFileSync(
  fileURLToPath(new URL('../app/(app)/admin/badges/page.tsx', import.meta.url)),
  'utf8',
);

describe('group badge admin boundaries', () => {
  it('scopes imports to an active manager, group and workspace', () => {
    expect(importer).toContain("role: 'MANAGER'");
    expect(importer).toContain("status: 'ACTIVE'");
    expect(importer).toContain('workspaceId,');
    expect(importer).toContain('groupId,');
    expect(importer).toContain("mode: 'insensitive'");
  });

  it('requires an active group manager to open the group page', () => {
    expect(groupPage).toContain("role: 'MANAGER'");
    expect(groupPage).toContain("status: 'ACTIVE'");
    expect(groupPage).not.toContain('ownerKnowledge');
    expect(groupPage).not.toContain('bunshinMemory');
  });

  it('limits badge publication review to super admins', () => {
    expect(adminPage).toContain("role: 'SUPER_ADMIN'");
    expect(adminPage).toContain("status: 'ACTIVE'");
  });
});
