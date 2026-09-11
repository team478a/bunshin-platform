import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/http/service-reward-export.ts', import.meta.url)),
  'utf8',
);
const page = readFileSync(
  fileURLToPath(new URL('../app/s/[serviceSlug]/manage/points/page.tsx', import.meta.url)),
  'utf8',
);

describe('service reward export boundaries', () => {
  it('requires a managed service context and scopes every export to the service', () => {
    expect(source).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
    expect(source).toContain('where: { workspaceId, groupId');
    expect(source).toContain("'cache-control': 'private, no-store'");
    expect(source).toContain("'x-content-type-options': 'nosniff'");
  });

  it('exports participant, point, badge, and operator audit records through explicit links', () => {
    expect(source).toContain("['summary', 'points', 'badges', 'audit']");
    expect(source).toContain('csv(rows)');
    expect(page).toContain('参加者一覧を保存');
    expect(page).toContain('ポイント履歴を保存');
    expect(page).toContain('バッジ履歴を保存');
    expect(page).toContain('運営操作履歴を保存');
  });

  it('combines point and badge audit logs without dropping immutable change details', () => {
    expect(source).toContain('serviceConfigurationAudit.findMany');
    expect(source).toContain('badgeAdminAuditLog.findMany');
    expect(source).toContain("category: 'ポイント'");
    expect(source).toContain("category: 'バッジ'");
    expect(source).toContain('jsonCell(row.beforeData)');
    expect(source).toContain('jsonCell(row.afterData)');
  });
});
