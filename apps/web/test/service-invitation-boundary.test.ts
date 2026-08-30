import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const web = join(process.cwd());
const source = (path: string) => readFileSync(join(web, path), 'utf8');

describe('service invitation boundary', () => {
  it('creates a service URL only after matching service and group', () => {
    const handler = source('src/http/group-invitations.ts');
    expect(handler).toContain('groupId: uuid.parse(groupId)');
    expect(handler).toContain('slug: value.serviceSlug');
    expect(handler).toContain('service scope mismatch');
    expect(handler).toContain('/s/${value.serviceSlug}/join/${token}');
  });

  it('verifies that the invitation token belongs to the service', () => {
    const page = source('app/(app)/groups/invitations/[token]/page.tsx');
    expect(page).toContain('invitations:');
    expect(page).toContain('tokenHash: groupInvitationTokenHash(token)');
    expect(page).toContain('serviceConfiguration: { slug: serviceSlug }');
  });

  it('keeps the service slug through the invitation editor', () => {
    const members = source('app/(app)/groups/[groupId]/members/page.tsx');
    const editor = source('app/ui/group-invitation-editor.tsx');
    expect(members).toContain('serviceSlug={query.service}');
    expect(editor).toContain('...(serviceSlug ? { serviceSlug } : {})');
  });
});
