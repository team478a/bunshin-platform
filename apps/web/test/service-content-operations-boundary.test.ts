import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const web = process.cwd();
const source = (path: string) => readFileSync(join(web, path), 'utf8');

describe('service content operations boundary', () => {
  it.each(['knowledge', 'product-packs', 'campaigns'])(
    'resolves %s with the limited content permission',
    (section) => {
      const page = source(`app/s/[serviceSlug]/manage/${section}/page.tsx`);
      expect(page).toContain("resolveManagedServiceContext(serviceSlug, actor.userId, 'CONTENT')");
      if (section !== 'knowledge') expect(page).toContain('groupId: service.serviceId');
      expect(page).not.toContain("role: 'MANAGER'");
    },
  );

  it('uses service-scoped APIs instead of workspace management APIs', () => {
    const productPage = source('app/s/[serviceSlug]/manage/product-packs/page.tsx');
    const campaignPage = source('app/s/[serviceSlug]/manage/campaigns/page.tsx');
    expect(productPage).toContain('/api/services/${service.configuration.slug}/product-packs');
    expect(campaignPage).toContain('/api/services/${service.configuration.slug}/campaigns');
  });

  it('rejects a product or campaign group supplied outside the resolved service', () => {
    expect(source('app/api/services/[serviceSlug]/product-packs/route.ts')).toContain(
      'body.groupId !== scope.groupId',
    );
    expect(source('src/http/campaigns.ts')).toContain('value.groupId !== groupId');
  });

  it('keeps service manager navigation under the service slug', () => {
    const home = source('app/s/[serviceSlug]/home/page.tsx');
    expect(home).toContain('/manage/product-packs');
    expect(home).toContain('/manage/campaigns');
  });

  it('requires the matching service slug before the shared knowledge page accepts an editor', () => {
    const page = source('app/(app)/groups/[groupId]/knowledge/page.tsx');
    expect(page).toContain('serviceConfiguration: { slug: serviceSlug }');
    expect(page).toContain("'CONTENT_EDITOR'");
    expect(page).toContain('...(serviceSlug');
  });
});
