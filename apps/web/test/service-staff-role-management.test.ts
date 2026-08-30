import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');

describe('service staff role management boundary', () => {
  it('provides service-scoped list and update endpoints', () => {
    const handler = source('src/http/service-staff-roles.ts');
    expect(handler).toContain('PrismaServiceStaffRoleRepository');
    expect(handler).toContain('ServiceStaffRoleService');
    expect(handler).toContain('requireSameOrigin(request)');
    expect(handler).toContain('slug: slug.parse(serviceSlug)');
    expect(handler).toContain('membershipId: membershipId.parse(rawMembershipId)');
  });

  it('shows the four plain-language duties only for a service', () => {
    const page = source('app/(app)/groups/[groupId]/members/page.tsx');
    expect(page).toContain('サービスで担当する役割');
    expect(page).toContain('サービス所有者');
    expect(page).toContain('運営管理者');
    expect(page).toContain('コンテンツ担当者');
    expect(page).toContain('一般参加者');
    expect(page).toContain('group.serviceConfiguration && query.service');
  });

  it('allows only an owner or super administrator to operate the role form', () => {
    const page = source('app/(app)/groups/[groupId]/members/page.tsx');
    expect(page).toContain("manager?.serviceRole === 'SERVICE_OWNER'");
    expect(page).toContain("platformAdmin?.role === 'SUPER_ADMIN'");
    expect(page).toContain('disabled={!canManageStaff}');
  });
});
