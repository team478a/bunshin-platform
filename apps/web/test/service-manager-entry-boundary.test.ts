import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(process.cwd(), 'app');
const source = (path: string) => readFileSync(join(root, path), 'utf8');

describe('service manager entry boundary', () => {
  it('keeps management links under the public service slug', () => {
    const home = source('s/[serviceSlug]/home/page.tsx');
    for (const section of ['members', 'knowledge', 'legal', 'badges']) {
      expect(home).toContain(`/s/\${service.configuration.slug}/manage/${section}`);
      expect(home).not.toContain(`/groups/\${groupId}/${section}`);
    }
  });

  it.each(['members', 'knowledge', 'legal', 'badges'])(
    'resolves %s from the server-side service context',
    (section) => {
      const page = source(`s/[serviceSlug]/manage/${section}/page.tsx`);
      expect(page).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
      expect(page).toContain('groupId: service.serviceId');
      expect(page).not.toContain('groupId: searchParams');
    },
  );

  it('preserves manager authorization in every reused management screen', () => {
    expect(source('(app)/groups/[groupId]/members/page.tsx')).toContain("role: 'MANAGER'");
    expect(source('(app)/groups/[groupId]/knowledge/page.tsx')).toContain("role: 'MANAGER'");
    expect(source('(app)/groups/[groupId]/badges/page.tsx')).toContain("role: 'MANAGER'");
    expect(source('(app)/groups/[groupId]/legal/page.tsx')).toContain(
      'await canManage(service.group.workspaceId, service.groupId, userId)',
    );
  });
});
