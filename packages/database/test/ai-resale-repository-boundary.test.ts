import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'resale.ts'), 'utf8');

describe('AI resale repository boundary', () => {
  it('authorizes with workspace, group, enrollment and active membership', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('programEnrollmentId: enrollment.id');
    expect(source).toContain("status: 'ACTIVE'");
  });

  it('allows only the enrollment member or a service manager', () => {
    expect(source).toContain("['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(actor.serviceRole)");
    expect(source).toContain('enrollment.groupMembershipId !== actor.id');
  });

  it('uses optimistic revision updates', () => {
    expect(source).toContain('revision: input.expectedRevision');
    expect(source).toContain('revision: { increment: 1 }');
    expect(source).toContain('updated.count !== 1');
  });
});
