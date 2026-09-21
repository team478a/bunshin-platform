import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'program-runtime.ts'), 'utf8');
const runtime = source.slice(source.indexOf('export class PrismaProgramRuntimeRepository'));

describe('program runtime repository boundary', () => {
  it('checks workspace, group and enrollment together', () => {
    expect(runtime).toContain('workspaceId: input.workspaceId');
    expect(runtime).toContain('groupId: input.groupId');
    expect(runtime).toContain('programEnrollmentId: enrollment.id');
    expect(runtime).toContain('programTemplateVersionId: input.programTemplateVersionId');
  });

  it('records assignment transitions and events atomically', () => {
    const transition = runtime.slice(
      runtime.indexOf('async transitionAssignment'),
      runtime.indexOf('async appendEvent'),
    );
    expect(transition).toContain('this.client.$transaction');
    expect(transition).toContain('tx.programMissionAssignment.updateMany');
    expect(transition).toContain('tx.programActionEvent.create');
  });

  it('uses stable idempotency keys for event replay', () => {
    expect(runtime).toContain('workspaceId_groupId_idempotencyKey');
    expect(runtime).toContain("error.code !== 'P2002'");
    expect(runtime).toContain('created: false');
  });
});
