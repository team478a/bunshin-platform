import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  actor: null as { userId: string } | null,
  member: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(mocks.actor) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: mocks.member }));

import { memberServiceMetadata } from '../src/services/member-service-metadata';

describe('member service metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor = { userId: 'user-a' };
    mocks.member.mockResolvedValue({ configuration: { displayName: '非公開の千ノ国メディア' } });
  });

  it('uses the authenticated member service, including private services', async () => {
    await expect(memberServiceMetadata('sennokuni', 'ホーム')).resolves.toEqual({
      title: '非公開の千ノ国メディア｜ホーム',
    });
    expect(mocks.member).toHaveBeenCalledWith('sennokuni', 'user-a');
  });

  it('does not reveal a service name to anonymous or non-member visitors', async () => {
    mocks.actor = null;
    await expect(memberServiceMetadata('sennokuni', 'ホーム')).resolves.toEqual({
      title: 'ホーム',
    });
    expect(mocks.member).not.toHaveBeenCalled();
    mocks.actor = { userId: 'other-user' };
    mocks.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'not a member'));
    await expect(memberServiceMetadata('sennokuni', 'ホーム')).resolves.toEqual({
      title: 'ホーム',
    });
    mocks.member.mockRejectedValue(new ApplicationError('FORBIDDEN', 'inactive membership'));
    await expect(memberServiceMetadata('sennokuni', 'ホーム')).resolves.toEqual({
      title: 'ホーム',
    });
  });

  it('does not hide unexpected resolver failures', async () => {
    const error = new Error('database unavailable');
    mocks.member.mockRejectedValue(error);
    await expect(memberServiceMetadata('sennokuni', 'ホーム')).rejects.toBe(error);
  });
});
