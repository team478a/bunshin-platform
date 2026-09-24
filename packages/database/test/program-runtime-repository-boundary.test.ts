import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const core = readFileSync(join(process.cwd(), 'src', 'program-runtime.ts'), 'utf8');
const runtime = readFileSync(join(process.cwd(), 'src', 'program-runtime-execution.ts'), 'utf8');
const publicModule = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf8');

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

  it('keeps runtime persistence separate while preserving the legacy export', () => {
    expect(runtime).toContain('export class PrismaProgramRuntimeRepository');
    expect(core).not.toContain('class PrismaProgramRuntimeRepository');
    expect(core).toContain(
      "export { PrismaProgramRuntimeRepository } from './program-runtime-execution';",
    );
    expect(publicModule).toContain(
      "export { PrismaProgramRuntimeRepository } from './program-runtime-execution';",
    );
  });
});
