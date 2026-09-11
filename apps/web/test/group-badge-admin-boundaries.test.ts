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

  it('lets a service operator create and award within the service route', () => {
    expect(groupPage).toContain('ReviewGroupBadge(repository).execute');
    expect(groupPage).toContain('ReviewGroupBadgeCandidate(repository).execute');
    expect(groupPage).toContain('サービス運営者による直接付与');
    expect(groupPage).toContain('RevokeGroupBadgeAward');
    expect(groupPage).toContain('誤って付与したバッジを取り消す');
    expect(groupPage).toContain("serviceOperator ? '作成したバッジ' : '申請したバッジ'");
    expect(groupPage).toContain('作成後すぐに参加者へ付与できます。');
    expect(groupPage).toContain('SetGroupBadgeAvailability');
    expect(groupPage).toContain('新しい付与を停止する');
    expect(groupPage).toContain('付与を再開する');
  });

  it('limits badge publication review to super admins', () => {
    expect(adminPage).toContain("role: 'SUPER_ADMIN'");
    expect(adminPage).toContain("status: 'ACTIVE'");
  });
});
