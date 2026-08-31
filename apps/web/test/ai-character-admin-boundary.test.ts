import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const http = readFileSync(new URL('../src/http/ai-characters.ts', import.meta.url), 'utf8');
const page = readFileSync(
  new URL('../app/s/[serviceSlug]/manage/characters/page.tsx', import.meta.url),
  'utf8',
);
describe('AI character admin boundary', () => {
  it('requires same origin, session, and managed service context', () => {
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('currentUserProvider');
    expect(http).toContain('resolveManagedServiceContext');
  });
  it('scopes every profile operation to workspace and service', () => {
    expect(http).toContain('workspaceId: service.workspaceId');
    expect(http).toContain('groupId: service.serviceId');
    expect(http).toContain("scope: 'SERVICE'");
  });
  it('versions license and prompt while preserving an audit trail', () => {
    expect(http).toContain('aiCharacterLicenseVersion.aggregate');
    expect(http).toContain("status: 'SUPERSEDED'");
    expect(http).toContain('aiCharacterAuditLog.create');
  });
  it('protects the server-rendered management page', () => {
    expect(page).toContain('resolveManagedServiceContext');
    expect(page).toContain('currentUserProvider');
  });
});
