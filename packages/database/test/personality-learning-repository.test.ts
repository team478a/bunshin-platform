import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('Prisma personality learning proposal repository', () => {
  const repository = source.slice(
    source.indexOf('export class PrismaPersonalityLearningProposalRepository'),
    source.indexOf('export async function checkDatabaseReadiness'),
  );

  it('scopes every operation through the active workspace membership and Bunshin owner gate', () => {
    expect(repository).toContain('workspaceId: input.workspaceId');
    expect(repository).toContain("where: { userId: input.actorUserId, status: 'ACTIVE' }");
    expect(repository).toContain('canManageBunshin(');
    expect(repository).toContain("status: { not: 'ARCHIVED' }");
  });

  it('applies and revokes personality versions in database transactions', () => {
    expect(repository.match(/this\.client\.\$transaction/g)).toHaveLength(5);
    expect(repository).toContain("status: 'APPROVED'");
    expect(repository).toContain("source: 'LEARNING'");
    expect(repository).toContain("status: 'REVOKED'");
    expect(repository).toContain("source: 'RESTORE'");
  });

  it('only mutates proposals in the expected current state', () => {
    expect(repository).toContain("status: 'PENDING'");
    expect(repository).toContain("status: 'APPROVED'");
    expect(repository).toContain('pending learning proposal already exists');
  });
});
