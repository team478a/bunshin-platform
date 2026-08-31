import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const http = readFileSync(
  new URL('../src/http/ai-character-references.ts', import.meta.url),
  'utf8',
);
const storage = readFileSync(
  new URL('../src/ai-character-reference-storage.ts', import.meta.url),
  'utf8',
);
const page = readFileSync(
  new URL('../app/s/[serviceSlug]/manage/characters/page.tsx', import.meta.url),
  'utf8',
);

describe('AI character reference image boundary', () => {
  it('requires a same-origin request, authenticated service manager, and rights confirmation', () => {
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('currentUserProvider');
    expect(http).toContain('resolveManagedServiceContext');
    expect(http).toContain("form.get('rightsConfirmed') !== 'true'");
  });

  it('scopes both upload and display to the current workspace and service', () => {
    expect(http).toContain('workspaceId: service.workspaceId');
    expect(http).toContain('groupId: service.serviceId');
    expect(http).toContain("status: 'PUBLISHED'");
    expect(http).toContain("status: 'READY'");
    expect(page).toContain('workspaceId: service.workspaceId');
    expect(page).toContain('groupId: service.serviceId');
  });

  it('keeps files private and validates their actual image format', () => {
    expect(storage).toContain("const BUCKET = 'ai-character-references'");
    expect(storage).toContain('public: false');
    expect(storage).toContain('actualType(bytes)');
    expect(storage).toContain("'image/jpeg'");
    expect(storage).toContain("'image/png'");
    expect(storage).toContain("'image/webp'");
    expect(storage).toContain("createHash('sha256')");
  });

  it('does not expose a public URL and protects image responses from caching', () => {
    expect(http).toContain("'cache-control': 'private, no-store'");
    expect(http).toContain("'x-content-type-options': 'nosniff'");
    expect(http).toContain('content-security-policy');
    expect(http).not.toContain('getPublicUrl');
  });

  it('removes a stored file when database recording fails and records an audit event', () => {
    expect(http).toContain('await storage.remove(stored.storageKey)');
    expect(http).toContain('aiCharacterAuditLog.create');
    expect(http).toContain("action: 'UPLOADED'");
  });
});
