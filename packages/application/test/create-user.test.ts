import { describe, expect, it } from 'vitest';
import type { AccountTransaction, AccountUnitOfWork } from '../src';
import { CreateUserWithPersonalWorkspace } from '../src';

function transactionRecorder(failAt?: 'workspace' | 'membership') {
  const committed: string[] = [];
  const unit: AccountUnitOfWork = {
    async transaction(operation) {
      const pending: string[] = [];
      const tx: AccountTransaction = {
        createUser(input) {
          pending.push('user');
          return Promise.resolve({
            id: 'user-1',
            status: 'ACTIVE',
            displayName: input.displayName,
            email: input.email ?? null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          });
        },
        createPersonalWorkspace(input) {
          if (failAt === 'workspace') throw new Error('workspace failed');
          pending.push('workspace');
          return Promise.resolve({
            id: 'workspace-1',
            type: 'PERSONAL',
            name: input.name,
            status: 'ACTIVE',
            createdAt: new Date(0),
            updatedAt: new Date(0),
          });
        },
        createOwnerMembership(input) {
          if (failAt === 'membership') throw new Error('membership failed');
          pending.push('membership');
          return Promise.resolve({
            id: 'membership-1',
            ...input,
            role: 'OWNER',
            status: 'ACTIVE',
            createdAt: new Date(0),
            updatedAt: new Date(0),
          });
        },
      };
      const result = await operation(tx);
      committed.push(...pending);
      return result;
    },
  };
  return { unit, committed };
}

describe('CreateUserWithPersonalWorkspace', () => {
  it('creates a user, PERSONAL workspace, and OWNER membership in one unit', async () => {
    const state = transactionRecorder();
    const result = await new CreateUserWithPersonalWorkspace(state.unit).execute({
      displayName: ' Alice ',
    });
    expect(result.workspace.type).toBe('PERSONAL');
    expect(result.membership.role).toBe('OWNER');
    expect(result.membership.userId).toBe(result.user.id);
    expect(state.committed).toEqual(['user', 'workspace', 'membership']);
  });

  it('does not commit partial data when membership creation fails', async () => {
    const state = transactionRecorder('membership');
    await expect(
      new CreateUserWithPersonalWorkspace(state.unit).execute({ displayName: 'Alice' }),
    ).rejects.toThrow('membership failed');
    expect(state.committed).toEqual([]);
  });

  it('rejects an empty display name before starting a transaction', () => {
    const state = transactionRecorder();
    expect(() =>
      new CreateUserWithPersonalWorkspace(state.unit).execute({ displayName: ' ' }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(state.committed).toEqual([]);
  });
});
