import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(app)/admin/oem-onboarding/page.tsx', import.meta.url),
  'utf8',
);
const invitation = readFileSync(
  new URL('../app/(app)/organizations/invitations/[token]/page.tsx', import.meta.url),
  'utf8',
);

describe('OEM onboarding boundary', () => {
  it('requires a super admin and provisions the tenant in one transaction', () => {
    expect(page).toContain("admin.role !== 'SUPER_ADMIN'");
    expect(page).toContain('db.prisma.$transaction');
    expect(page).toContain("type: 'ORGANIZATION'");
    expect(page).toContain('oemEnabled: true');
    expect(page).toContain("visibility: 'PRIVATE'");
    expect(page).toContain("status: 'DRAFT'");
    expect(page).toContain("role: 'ADMIN'");
  });

  it('keeps launch-sensitive integrations outside automatic activation', () => {
    expect(page).not.toContain('organizationPaymentConfiguration.create');
    expect(page).not.toContain('groupLineChannelConfiguration.create');
    expect(page).toContain('規約、LINE、決済、ブランドを確認した後に公開');
  });

  it('grants an accepted OEM administrator access to its service projects', () => {
    expect(invitation).toContain("grantedRole === 'ADMIN' && entitlement?.oemEnabled");
    expect(invitation).toContain("serviceRole: 'SERVICE_ADMIN'");
    expect(invitation).toContain('groupId_userId');
  });
});
