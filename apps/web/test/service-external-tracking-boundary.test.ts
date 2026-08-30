import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('service external tracking boundary', () => {
  it('resolves the service on the server and requires its manager', () => {
    const page = source('app/s/[serviceSlug]/manage/external-tracking/page.tsx');
    expect(page).toContain('resolveManagedServiceContext');
    expect(page).toContain('groupId: service.serviceId');
    expect(page).not.toContain("role: 'MANAGER'");
    expect(page).not.toContain('searchParams');
  });

  it('uses the service-scoped endpoint from every reused operation', () => {
    const page = source('app/s/[serviceSlug]/manage/external-tracking/page.tsx');
    expect(page).toContain('/api/services/${service.configuration.slug}/external-tracking');
    const editor = source('app/(app)/admin/external-tracking/external-tracking-operations.tsx');
    expect(editor).toContain('apiBase ??');
  });

  it('rejects group IDs outside the resolved service for list, export, import, and create', () => {
    const http = source('src/http/external-tracking-links.ts');
    expect(http.match(/service boundary mismatch/g)).toHaveLength(4);
    expect(http).toContain('new db.PrismaExternalTrackingLinkRepository(undefined, serviceId)');
  });

  it('constrains resources again inside the repository', () => {
    const database = source('../../packages/database/src/index.ts');
    expect(database).toContain('private readonly serviceId?: string');
    expect(database).toContain('private serviceMatches(groupId: string)');
    expect(database).toContain("role: 'MANAGER'");
    expect(database).toContain('...(this.serviceId ? { groupId: this.serviceId } : {})');
  });
});
