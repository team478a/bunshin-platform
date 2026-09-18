import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'resale-participant.ts'), 'utf8');

describe('AI resale participant persistence boundaries', () => {
  it('scopes enrollment, membership, program, action, item, and progress to the tenant participant', () => {
    expect(source).toContain('workspaceId: input.workspaceId');
    expect(source).toContain('groupId: input.groupId');
    expect(source).toContain('userId: input.actorUserId');
    expect(source).toContain("serviceRole: 'PARTICIPANT'");
    expect(source).toContain('programEnrollmentId: scope.enrollment.id');
    expect(source).toContain('ownerUserId: input.actorUserId');
    expect(source).toContain("moduleKey'], equals: AI_RESALE_V1_MODULE_KEY");
  });

  it('uses a serializable idempotent write and optimistic revisions', () => {
    expect(source).toContain("isolationLevel: 'Serializable'");
    expect(source).toContain('ai-resale:result:${input.idempotencyKey}');
    expect(source).toContain('workspaceId_groupId_idempotencyKey');
    expect(source).toContain('revision: item.revision');
    expect(source).toContain('revision: progress.revision');
    expect(source).toContain("['P2002', 'P2034']");
  });

  it('records the presented action result and item lifecycle evidence together', () => {
    expect(source).toContain("'ACTION_COMPLETED'");
    expect(source).toContain("'ACTION_PARTIAL'");
    expect(source).toContain("'ACTION_NOT_COMPLETED'");
    expect(source).toContain("'FIRST_LISTING'");
    expect(source).toContain("'FIRST_SALE'");
    expect(source).toContain("'RECOVERED'");
    expect(source).toContain('currentAssignmentId: null');
    expect(source).toContain('nextEvaluationAt: input.occurredAt');
  });
});
