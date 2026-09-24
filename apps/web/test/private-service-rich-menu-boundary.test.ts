import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

describe('private service rich menu destinations', () => {
  it.each([
    'app/s/[serviceSlug]/home/page.tsx',
    'app/s/[serviceSlug]/bunshins/page.tsx',
    'app/s/[serviceSlug]/onboarding/page.tsx',
    'app/s/[serviceSlug]/bunshins/new/page.tsx',
  ])('authenticates before resolving member access in %s', (relativePath) => {
    const page = source(relativePath);
    expect(page).toMatch(
      /const actor = await[\s\S]*if \(!actor\) redirect[\s\S]*context\(serviceSlug, actor\.userId\)/,
    );
    expect(page).toContain('returnTo=${encodeURIComponent(returnTo)}');
  });

  it('preserves the service account destination through LINE login', () => {
    const page = source('app/(app)/account/page.tsx');
    expect(page).toContain('`/account?service=${encodeURIComponent(requestedService)}`');
    expect(page).toContain('`/login?returnTo=${encodeURIComponent(returnTo)}`');
  });

  it.each([
    'app/s/[serviceSlug]/activity/page.tsx',
    'app/s/[serviceSlug]/weekly-report/page.tsx',
    'app/s/[serviceSlug]/programs/page.tsx',
    'app/s/[serviceSlug]/credits/page.tsx',
    'app/s/[serviceSlug]/tracking-link/page.tsx',
    'app/s/[serviceSlug]/images/page.tsx',
    'app/s/[serviceSlug]/videos/page.tsx',
    'app/s/[serviceSlug]/video-assets/page.tsx',
    'app/s/[serviceSlug]/videos/[videoProjectId]/page.tsx',
    'app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-data.ts',
  ])('uses the shared private member boundary in %s', (relativePath) => {
    const page = source(relativePath);
    expect(page).toContain('resolveAuthenticatedMemberServicePage');
    expect(page).not.toContain('const service = await resolvePublicServiceContext(serviceSlug);');
  });

  it('lets authenticated members open help for a private service', () => {
    const page = source('app/s/[serviceSlug]/help/page.tsx');
    expect(page).toContain('resolveMemberServiceContext(slug, actorUserId)');
    expect(page).toContain('serviceContext(serviceSlug, user?.userId)');
  });

  it('opens a private service mission from the points screen', () => {
    const page = source('app/(app)/points/open-mission/page.tsx');
    expect(page).toContain('resolveMemberServiceContext(serviceSlug, user.userId)');
    expect(page).not.toContain('resolvePublicServiceContext(serviceSlug)');
  });
});
