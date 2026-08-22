import { describe, expect, it, vi } from 'vitest';
import { SessionCurrentUserProvider } from '../src/index';

describe('SessionCurrentUserProvider', () => {
  it('rejects an absent or invalid session', async () => {
    const accounts = { findActiveByEmailIdentity: vi.fn(), provisionEmailIdentity: vi.fn() };
    const provider = new SessionCurrentUserProvider(
      { getVerifiedUser: () => Promise.resolve(null) },
      accounts,
    );
    await expect(provider.getCurrentUser()).resolves.toBeNull();
    expect(accounts.findActiveByEmailIdentity).not.toHaveBeenCalled();
  });

  it('uses the existing platform identity', async () => {
    const existing = { userId: 'user-1', authIdentityId: 'identity-1' };
    const accounts = {
      findActiveByEmailIdentity: vi.fn().mockResolvedValue(existing),
      provisionEmailIdentity: vi.fn(),
    };
    const verified = { providerUserId: 'provider-1', email: 'user@example.com', displayName: null };
    const provider = new SessionCurrentUserProvider(
      { getVerifiedUser: () => Promise.resolve(verified) },
      accounts,
    );
    await expect(provider.getCurrentUser()).resolves.toEqual(existing);
    expect(accounts.provisionEmailIdentity).not.toHaveBeenCalled();
  });

  it('provisions the first verified login once through the account repository', async () => {
    const created = { userId: 'user-1', authIdentityId: 'identity-1' };
    const accounts = {
      findActiveByEmailIdentity: vi.fn().mockResolvedValue(null),
      provisionEmailIdentity: vi.fn().mockResolvedValue(created),
    };
    const verified = {
      providerUserId: 'provider-1',
      email: 'user@example.com',
      displayName: 'User',
    };
    const provider = new SessionCurrentUserProvider(
      { getVerifiedUser: () => Promise.resolve(verified) },
      accounts,
    );
    await expect(provider.getCurrentUser()).resolves.toEqual(created);
    expect(accounts.provisionEmailIdentity).toHaveBeenCalledWith(verified);
  });
});
