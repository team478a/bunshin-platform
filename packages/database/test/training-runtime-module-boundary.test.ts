import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(join(process.cwd(), 'src', file), 'utf8');

describe('AI training runtime repository modules', () => {
  it('keeps the public runtime repository as a compatibility facade', () => {
    const facade = source('training-runtime.ts');
    expect(facade).toContain('PrismaAiTrainingRuntimeStateRepository');
    expect(facade).toContain('PrismaAiTrainingRuntimeCandidateRepository');
    expect(facade).toContain('PrismaAiTrainingRuntimeDecisionRepository');
    expect(facade).not.toContain('$transaction');
    expect(facade).not.toContain('programEnrollment.findFirst');
  });

  it('separates state, candidate selection, and decision persistence', () => {
    const state = source('training-runtime-state-repository.ts');
    const candidate = source('training-runtime-candidate-repository.ts');
    const decision = source('training-runtime-decision-repository.ts');
    expect(state).toContain('async findState');
    expect(state).not.toContain('async findCandidate');
    expect(candidate).toContain('async findCandidate');
    expect(candidate).not.toContain('async persistDecision');
    expect(decision).toContain('async persistDecision');
    expect(decision).toContain("isolationLevel: 'Serializable'");
  });

  it('centralizes enrollment and tenant isolation in the shared scope resolver', () => {
    const shared = source('training-runtime-shared.ts');
    expect(shared).toContain('workspaceId: input.workspaceId');
    expect(shared).toContain('groupId: input.groupId');
    expect(shared).toContain('userId: input.actorUserId');
    expect(shared).toContain(
      "settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY }",
    );
    expect(shared).toContain("status: 'PUBLISHED'");
  });
});
