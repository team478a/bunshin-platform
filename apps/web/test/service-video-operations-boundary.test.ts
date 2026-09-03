import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const web = process.cwd();
const source = (path: string) => readFileSync(join(web, path), 'utf8');

describe('service video operations boundary', () => {
  it('requires a service manager and scopes both video queries to the resolved service', () => {
    const page = source('app/s/[serviceSlug]/manage/video-operations/page.tsx');
    expect(page).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
    expect(page).toContain('workspaceId: service.workspaceId, groupId: service.serviceId');
    expect(page).toContain('db.prisma.videoRender.findMany');
    expect(page).toContain('db.prisma.videoSceneGeneration.findMany');
  });

  it('does not expose generation prompts, external provider job ids, or output URLs', () => {
    const page = source('app/s/[serviceSlug]/manage/video-operations/page.tsx');
    expect(page).not.toContain('inputSnapshot');
    expect(page).not.toContain('externalJobId');
    expect(page).not.toContain('outputStorageKey');
  });

  it('links the service-only operation screen from the service management home', () => {
    expect(source('app/s/[serviceSlug]/manage/page.tsx')).toContain("href: 'video-operations'");
  });
});
