import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveProfile } from '../app/(app)/organizations/[workspaceId]/manage/organization-manage-actions';

const mocks = vi.hoisted(() => ({
  actor: vi.fn<() => Promise<{ userId: string } | null>>(),
  manager: vi.fn(),
  update: vi.fn(
    (input: { where: { id: string; type: 'ORGANIZATION' }; data: Record<string, unknown> }) =>
      Promise.resolve(input),
  ),
  revalidate: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.actor }),
}));
vi.mock('../app/(app)/organizations/[workspaceId]/manage/organization-manager-access', () => ({
  requireOrganizationManager: mocks.manager,
}));
const workspaceId = '11111111-1111-4111-8111-111111111111';
const form = (reason?: string) => {
  const body = new FormData();
  body.set('workspaceId', workspaceId);
  body.set('name', '運営団体');
  if (reason !== undefined) body.set('reason', reason);
  return body;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ userId: 'actor-a' });
  mocks.manager.mockResolvedValue({ prisma: { workspace: { update: mocks.update } } });
});
describe('organization profile saves', () => {
  it.each([undefined, '以前のクライアントのメモ'])(
    'saves without an unused reason while accepting old FormData (%s)',
    async (reason) => {
      await expect(saveProfile(form(reason))).rejects.toThrow(
        `REDIRECT:/organizations/${workspaceId}/manage?saved=profile`,
      );
      expect(mocks.manager).toHaveBeenCalledWith(workspaceId, 'actor-a');
      expect(mocks.update).toHaveBeenCalledTimes(1);
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: workspaceId, type: 'ORGANIZATION' },
        data: { name: '運営団体' },
      });
      expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty('data.reason');
    },
  );
  it('requires authentication, valid input and management of this organization', async () => {
    mocks.actor.mockResolvedValueOnce(null);
    await expect(saveProfile(form())).rejects.toThrow('REDIRECT:/login');
    expect(mocks.manager).not.toHaveBeenCalled();
    const invalid = form();
    invalid.set('workspaceId', 'invalid');
    await expect(saveProfile(invalid)).rejects.toThrow('error=invalid');
    mocks.manager.mockRejectedValueOnce(new Error('NOT_FOUND'));
    await expect(saveProfile(form())).rejects.toThrow('NOT_FOUND');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
