import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('service management role authorization', () => {
  it('uses the service duty instead of the legacy group role at the shared boundary', () => {
    const resolver = source('src/services/public-service.ts');
    expect(resolver).toContain("SERVICE_MANAGEMENT_ROLES = ['SERVICE_OWNER', 'SERVICE_ADMIN']");
    expect(resolver).toContain("permission: ServiceManagementPermission = 'ADMINISTRATION'");
    expect(resolver).toContain("permission === 'CONTENT'");
    expect(resolver).not.toContain("some: { userId: actorUserId, role: 'MANAGER'");
  });

  it.each([
    'members',
    'knowledge',
    'legal',
    'badges',
    'campaigns',
    'product-packs',
    'external-tracking',
    'settings',
    'line',
    'programs',
  ])('protects the %s management entry with the shared resolver', (section) => {
    const page = source(`app/s/[serviceSlug]/manage/${section}/page.tsx`);
    expect(page).toContain('resolveManagedServiceContext');
  });

  it('keeps administration navigation limited while exposing only content links to editors', () => {
    const home = source('app/s/[serviceSlug]/home/page.tsx');
    expect(home).toContain("['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(membership.serviceRole)");
    expect(home).toContain("membership.serviceRole === 'CONTENT_EDITOR'");
    const editorSection = home.slice(home.indexOf("membership.serviceRole === 'CONTENT_EDITOR'"));
    expect(editorSection).toContain('/manage/knowledge');
    expect(editorSection).toContain('/manage/product-packs');
    expect(editorSection).toContain('/manage/campaigns');
    expect(editorSection).not.toContain('/manage/settings');
    expect(editorSection).not.toContain('/manage/line');
    expect(editorSection).not.toContain('/manage/members');
    expect(editorSection).not.toContain('/manage/legal');
    expect(editorSection).not.toContain('/manage/external-tracking');
    expect(home).not.toContain("membership.role === 'MANAGER'");
  });
});
