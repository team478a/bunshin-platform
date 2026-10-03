import { describe, expect, it, vi } from 'vitest';
import { PrismaImprovementFeedbackRepository } from '../src/improvement-feedback';
import type { ImprovementFeedbackInput } from '@bunshin/application';
const id = '00000000-0000-4000-8000-000000000001';
const input: ImprovementFeedbackInput = {
  workspaceId: id,
  serviceId: id,
  bunshinId: id,
  actorUserId: id,
  submissionKey: id,
  packageKey: 'SOCIAL',
  category: 'OPERATION',
  surface: 'TODAY',
  impact: 'BLOCKED',
};
function fixture(existing: object | null = null, allowed = true, count = 0) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    bunshin: { findFirst: vi.fn().mockResolvedValue(allowed ? { id } : null) },
    improvementFeedback: {
      findUnique: vi.fn().mockResolvedValue(existing),
      count: vi.fn().mockResolvedValue(count),
      create: vi
        .fn()
        .mockResolvedValue({ ...input, id, createdAt: new Date('2026-10-03T00:00:00Z') }),
    },
  };
  const repository = new PrismaImprovementFeedbackRepository({
    $transaction: (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  } as never);
  return { repository, tx };
}
describe('common trouble feedback persistence', () => {
  it('rejects an unsupported package synchronously before opening a transaction', () => {
    const { repository, tx } = fixture();
    expect(() => repository.record({ ...input, packageKey: 'TRAINING' as never })).toThrow(
      'invalid improvement feedback',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.improvementFeedback.create).not.toHaveBeenCalled();
  });
  it('authorizes all owner boundaries and active capability before storing', async () => {
    const { repository, tx } = fixture();
    await repository.record(input);
    expect(tx.bunshin.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id,
          workspaceId: id,
          groupId: id,
          ownerUserId: id,
          ownerUser: { status: 'ACTIVE' },
          capabilityAssignments: {
            some: { workspaceId: id, capabilityType: 'SOCIAL', status: 'ACTIVE' },
          },
          group: expect.objectContaining({
            status: 'ACTIVE',
            workspace: { status: 'ACTIVE' },
            serviceConfiguration: { isNot: null },
            memberships: { some: { workspaceId: id, userId: id, status: 'ACTIVE' } },
          }),
        }),
      }),
    );
    expect(tx.improvementFeedback.create).toHaveBeenCalledWith({ data: input });
  });
  it('rejects unauthorized access even for an existing submission', async () => {
    const { repository, tx } = fixture({ ...input }, false);
    await expect(repository.record(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tx.improvementFeedback.findUnique).not.toHaveBeenCalled();
    expect(tx.improvementFeedback.create).not.toHaveBeenCalled();
  });
  it('replays saved reports before the quota check without changing timestamps', async () => {
    const createdAt = new Date('2026-10-03T00:00:00Z');
    const { repository, tx } = fixture({ ...input, id, createdAt }, true, 10);
    expect(await repository.record(input)).toEqual({ id, createdAt });
    expect(tx.improvementFeedback.create).not.toHaveBeenCalled();
    expect(tx.improvementFeedback.count).not.toHaveBeenCalled();
  });
  it('rejects an expired raw-feedback replay without renewing or creating a source', async () => {
    const { repository, tx } = fixture({
      ...input,
      id,
      createdAt: new Date('2000-01-01T00:00:00Z'),
    });
    await expect(repository.record(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.improvementFeedback.create).not.toHaveBeenCalled();
    expect(tx.improvementFeedback.count).not.toHaveBeenCalled();
  });
  it.each(['serviceId', 'bunshinId', 'packageKey', 'category', 'surface', 'impact'] as const)(
    'rejects conflicting %s without overwriting',
    async (field) => {
      const { repository, tx } = fixture({ ...input, [field]: 'different' });
      await expect(repository.record(input)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(tx.improvementFeedback.create).not.toHaveBeenCalled();
    },
  );
  it('limits new submissions and does not conceal persistence failure', async () => {
    const { repository, tx } = fixture(null, true, 10);
    await expect(repository.record(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(tx.improvementFeedback.create).not.toHaveBeenCalled();
    const failing = fixture();
    failing.tx.improvementFeedback.create.mockRejectedValue(new Error('database unavailable'));
    await expect(failing.repository.record(input)).rejects.toThrow('database unavailable');
  });
});
