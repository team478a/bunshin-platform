import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('service manager settings boundary', () => {
  it('resolves private and public services through an active manager membership', () => {
    const resolver = source('src/services/public-service.ts');
    expect(resolver).toContain('resolveManagedServiceContext');
    expect(resolver).toContain("role: 'MANAGER', status: 'ACTIVE'");
    expect(resolver).toContain('findByGroup({ ...target, actorUserId })');
  });

  it('keeps platform-owned service controls unchanged in the manager endpoint', () => {
    const handler = source('src/http/service-settings.ts');
    expect(handler).toContain('...current');
    expect(handler).not.toContain('visibility: value.visibility');
    expect(handler).not.toContain('poweredByEnabled: value.poweredByEnabled');
    expect(handler).toContain('requireSameOrigin(request)');
  });

  it('rejects manager attempts to replace platform-owned fields at repository level', () => {
    const repository = source('../../packages/database/src/index.ts');
    expect(repository).toContain('value.slug !== existing.slug');
    expect(repository).toContain('value.visibility !== existing.visibility');
    expect(repository).toContain('value.poweredByEnabled !== existing.poweredByEnabled');
  });

  it('shows a manager-only settings entry from the service home', () => {
    const home = source('app/s/[serviceSlug]/home/page.tsx');
    const page = source('app/s/[serviceSlug]/manage/settings/page.tsx');
    expect(home).toContain('/manage/settings');
    expect(page).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
  });
});
