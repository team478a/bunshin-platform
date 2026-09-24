import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const importer = readFileSync(
  fileURLToPath(new URL('../src/http/group-badge-import.ts', import.meta.url)),
  'utf8',
);
const groupData = readFileSync(
  fileURLToPath(
    new URL('../app/(app)/groups/[groupId]/badges/group-badges-data.ts', import.meta.url),
  ),
  'utf8',
);
const groupActions = readFileSync(
  fileURLToPath(
    new URL('../app/(app)/groups/[groupId]/badges/group-badge-actions.ts', import.meta.url),
  ),
  'utf8',
);
const groupView = readFileSync(
  fileURLToPath(
    new URL('../app/(app)/groups/[groupId]/badges/group-badges-view.tsx', import.meta.url),
  ),
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
    expect(groupData).toContain("role: 'MANAGER'");
    expect(groupData).toContain("status: 'ACTIVE'");
    expect(groupData).not.toContain('ownerKnowledge');
    expect(groupData).not.toContain('bunshinMemory');
  });

  it('lets a service operator create and award within the service route', () => {
    expect(groupActions).toContain('ReviewGroupBadge(repository).execute');
    expect(groupActions).toContain('ReviewGroupBadgeCandidate(repository).execute');
    expect(groupActions).toContain('サービス運営者による直接付与');
    expect(groupActions).toContain('RevokeGroupBadgeAward');
    expect(groupView).toContain('誤って付与したバッジを取り消す');
    expect(groupView).toContain("serviceOperator ? '作成したバッジ' : '申請したバッジ'");
    expect(groupView).toContain('作成後すぐに参加者へ付与できます。');
    expect(groupActions).toContain('SetGroupBadgeAvailability');
    expect(groupView).toContain('新しい付与を停止する');
    expect(groupView).toContain('付与を再開する');
    expect(groupActions).toContain('ReviseGroupBadge');
    expect(groupView).toContain('名前や説明を変更する');
    expect(groupView).toContain('これからの付与には新しい表示を使います。');
    expect(groupActions).toContain('badgeAppearanceImageKey(parsed.data.badgeStyle)');
    expect(groupView).toContain('name="badgeStyle"');
    expect(groupData).toContain('membership.userId !== actor.userId');
    expect(groupView).toContain('運営者自身への付与はできません。');
  });

  it('limits badge publication review to super admins', () => {
    expect(adminPage).toContain("role: 'SUPER_ADMIN'");
    expect(adminPage).toContain("status: 'ACTIVE'");
  });
});
