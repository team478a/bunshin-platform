import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('service manager dedicated LINE boundary', () => {
  it('resolves the service slug before dispatching LINE operations', () => {
    const route = source('app/api/services/[serviceSlug]/line-configurations/[[...path]]/route.ts');
    expect(route).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
    expect(route).toContain('service.serviceId');
    expect(route).toContain("url.searchParams.set('workspaceId', service.workspaceId)");
  });

  it('allows only the scoped manager or platform operations staff in the repository', () => {
    const repository = source('../../packages/database/src/index.ts');
    expect(repository).toContain("role: 'MANAGER'");
    expect(repository).toContain("group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } }");
    expect(repository).toContain("access.admin?.role !== 'SUPER_ADMIN' && !access.manager");
  });

  it('keeps secret values masked after save and uses the existing encrypted workflow', () => {
    const editor = source('app/(app)/admin/groups/[groupId]/line/group-line-editor.tsx');
    const handler = source('src/http/group-line-configurations.ts');
    expect(editor).toContain('loginSecretMask');
    expect(editor).not.toContain('encryptedLoginSecret');
    expect(handler).toContain('new AesGcmLineSecretCrypto()');
  });

  it('adds a service manager entry and service-scoped endpoint', () => {
    const home = source('app/s/[serviceSlug]/home/page.tsx');
    const page = source('app/s/[serviceSlug]/manage/line/page.tsx');
    expect(home).toContain('/manage/line');
    expect(page).toContain('scopeLabel="サービス"');
    expect(page).toContain('/line-configurations`');
  });
});
