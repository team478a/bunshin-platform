import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaBunshinRepository } from '../src/index';

const scope = {
  workspaceId: 'workspace-a',
  groupId: 'service-a',
  actorUserId: 'admin-a',
  bunshinId: 'bunshin-a',
};
const row = {
  id: 'bunshin-a',
  workspaceId: 'workspace-a',
  groupId: 'service-a',
  ownerUserId: 'member-a',
  name: 'partner',
  slug: 'partner',
  type: 'EXPERT',
  status: 'ACTIVE',
  objectiveSummary: 'purpose',
  audienceSummary: 'audience',
  personalitySummary: 'tone',
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
  objectives: [],
  audiences: [],
  personality: null,
};
function repository(role: 'OWNER' | 'ADMIN' | 'MEMBER', groupId: string | null = 'service-a') {
  const findFirst = vi.fn(
    ({ where }: { where: { workspaceId: string; groupId: string | null; ownerUserId?: string } }) =>
      Promise.resolve(
        where.workspaceId !== row.workspaceId ||
          where.groupId !== groupId ||
          (where.ownerUserId !== undefined && where.ownerUserId !== row.ownerUserId)
          ? null
          : { id: row.id, ownerUserId: row.ownerUserId, workspace: { memberships: [{ role }] } },
      ),
  );
  const update = vi.fn().mockResolvedValue({ ...row, groupId });
  const tx = { bunshin: { findFirst, update } };
  const client = {
    $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaClient;
  return { repo: new PrismaBunshinRepository(client), findFirst, update };
}
describe('service participant partner writes', () => {
  it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
    'does not let %s edit or archive another service participant partner',
    async (role) => {
      const { repo, findFirst, update } = repository(role);
      expect(await repo.update({ ...scope, name: 'stolen' })).toBeNull();
      expect(await repo.archive(scope)).toBeNull();
      expect(update).not.toHaveBeenCalled();
      expect(findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            ownerUserId: scope.actorUserId,
          }),
        }),
      );
    },
  );
  it('permits this service owner to edit and archive their own partner', async () => {
    const { repo, update } = repository('MEMBER');
    const own = { ...scope, actorUserId: row.ownerUserId };
    expect(await repo.update({ ...own, name: 'edited' })).toMatchObject({ id: row.id });
    expect(await repo.archive(own)).toMatchObject({ id: row.id });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ARCHIVED', archivedAt: expect.any(Date) }),
      }),
    );
  });
  it.each([{ groupId: 'service-b' }, { workspaceId: 'workspace-b' }])(
    'rejects a different tenant/service before writing: %j',
    async (other) => {
      const { repo, update } = repository('ADMIN');
      expect(
        await repo.update({ ...scope, ...other, actorUserId: row.ownerUserId, name: 'stolen' }),
      ).toBeNull();
      expect(await repo.archive({ ...scope, ...other, actorUserId: row.ownerUserId })).toBeNull();
      expect(update).not.toHaveBeenCalled();
    },
  );
  it.each(['OWNER', 'ADMIN'] as const)(
    'preserves %s management of personal Bunshins',
    async (role) => {
      const { repo, findFirst, update } = repository(role, null);
      const personal = { ...scope, groupId: null };
      expect(await repo.update({ ...personal, name: 'managed' })).toMatchObject({ id: row.id });
      expect(await repo.archive(personal)).toMatchObject({ id: row.id });
      expect(update).toHaveBeenCalledTimes(2);
      expect(findFirst.mock.calls[0]?.[0].where).not.toHaveProperty('ownerUserId');
    },
  );
});
