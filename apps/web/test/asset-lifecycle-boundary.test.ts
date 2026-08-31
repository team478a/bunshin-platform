import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const web = process.cwd();
const source = (path: string) => readFileSync(join(web, path), 'utf8');

describe('asset lifecycle boundary', () => {
  it('runs the destructive purge only from the production cron endpoint', () => {
    const operations = source('src/http/asset-lifecycle-operations.ts');
    expect(operations).toContain('authorizeCronRequest(request, environment.CRON_SECRET)');
    expect(operations).toContain("environment.APP_ENV !== 'production'");
    expect(operations).toContain("route: '/api/internal/assets/purge-expired'");
  });

  it('limits deletion to the four private asset buckets and does not accept unsafe keys', () => {
    const storage = source('src/assets/asset-lifecycle-storage.ts');
    expect(storage).toContain("'social-image-media'");
    expect(storage).toContain("'video-assets'");
    expect(storage).toContain("'video-renders'");
    expect(storage).toContain("'video-ai-scenes'");
    expect(storage).toContain("!value.includes('..')");
  });

  it('keeps the service manager warning scoped to its own workspace and service', () => {
    const page = source('app/s/[serviceSlug]/manage/video-operations/page.tsx');
    expect(page).toContain('workspaceId: service.workspaceId, groupId: service.serviceId');
    expect(page).toContain('保存期限のお知らせ');
  });
});
