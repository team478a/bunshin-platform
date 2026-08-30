import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('platform service lifecycle boundary', () => {
  it('requires a platform super administrator and resolves the service on the server', () => {
    const handler = source('src/http/services.ts');
    const lifecycleHandler = handler.slice(
      handler.indexOf('export async function updateServiceLifecycle'),
    );
    expect(handler).toContain("role: 'SUPER_ADMIN'");
    expect(handler).toContain('where: { id: configurationId }');
    expect(lifecycleHandler).not.toContain('workspaceId: value.workspaceId');
    expect(lifecycleHandler).not.toContain('groupId: value.groupId');
  });

  it('updates status and public settings with a mandatory audit reason', () => {
    const handler = source('src/http/services.ts');
    expect(handler).toContain("status: z.enum(['ACTIVE', 'SUSPENDED'])");
    expect(handler).toContain('serviceConfigurationAudit.create');
    expect(handler).toContain('reason: value.reason.trim()');
  });

  it('gives the platform administrator an understandable lifecycle form', () => {
    const page = source('app/(app)/admin/services/service-lifecycle-editor.tsx');
    expect(page).toContain('公開・利用設定を保存する');
    expect(page).toContain('一時停止すると、利用者とサービス管理者はこのサービスを使えません。');
    expect(page).toContain('保存しました。最新の状態を表示します。');
  });
});
