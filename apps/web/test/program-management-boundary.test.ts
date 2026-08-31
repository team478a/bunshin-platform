import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('program management boundary', () => {
  const http = source('src/http/programs.ts');

  it('creates each composed operation in one transaction', () => {
    expect(http.match(/db\.prisma\.\$transaction/g)).toHaveLength(3);
    expect(http).toContain("resourceType: 'PROGRAM_TEMPLATE_VERSION'");
    expect(http).toContain("resourceType: 'PROGRAM_OFFERING'");
    expect(http).toContain("resourceType: 'PROGRAM_ENROLLMENT'");
  });

  it('requires platform authority for official templates', () => {
    expect(http).toContain("role: 'SUPER_ADMIN', status: 'ACTIVE'");
    expect(http).toContain("visibility: 'PLATFORM'");
    expect(http).toContain('ownerGroupId: null');
  });

  it('revalidates workspace, service and membership for manual enrollment', () => {
    const enrollment = http.slice(http.indexOf('export async function enrollProgramResponse'));
    expect(enrollment).toContain('workspaceId: service.workspaceId');
    expect(enrollment).toContain('groupId: service.serviceId');
    expect(enrollment).toContain('id: value.groupMembershipId');
    expect(enrollment).toContain("serviceRole: 'PARTICIPANT'");
    expect(enrollment).toContain("status: 'ACTIVE'");
    expect(enrollment).toContain('offeringSnapshot:');
  });

  it('keeps the first release free, invitation-only and manually enrolled', () => {
    expect(http).toContain("participation: 'INVITATION_ONLY'");
    expect(http).toContain('manualEnrollment: true');
    expect(http).toContain('isFree: true');
    expect(http).not.toMatch(/checkout|commission|revenueShare|refund/i);
  });

  it('protects both management pages on the server', () => {
    const admin = source('app/(app)/admin/programs/page.tsx');
    const service = source('app/s/[serviceSlug]/manage/programs/page.tsx');
    expect(admin).toContain("role: 'SUPER_ADMIN'");
    expect(service).toContain('resolveManagedServiceContext');
  });
});
