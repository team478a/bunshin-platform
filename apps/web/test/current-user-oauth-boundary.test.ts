import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  claims: vi.fn(),
  user: vi.fn(),
  find: vi.fn(),
  exists: vi.fn(),
  provision: vi.fn(),
}));
vi.mock('../src/auth/supabase', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ auth: { getClaims: m.claims, getUser: m.user } }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaCurrentUserAccountRepository: class {
    findActiveByEmailIdentity = m.find;
    emailIdentityExists = m.exists;
    provisionEmailIdentity = m.provision;
  },
}));
import { currentUserProvider } from '../src/auth/current-user';
beforeEach(() => {
  vi.resetAllMocks();
  m.claims.mockResolvedValue({
    data: { claims: { sub: 'verified-subject', aud: 'authenticated', role: 'authenticated' } },
    error: null,
  });
  m.user.mockResolvedValue({
    data: {
      user: {
        id: 'verified-subject',
        email: 'synthetic@example.invalid',
        user_metadata: { display_name: 'Synthetic' },
      },
    },
    error: null,
  });
  m.find.mockResolvedValue({ userId: 'owner', authIdentityId: 'identity' });
});
describe('first-party and delegated OAuth identity separation', () => {
  it.each([undefined, null])(
    'preserves verified first-party sessions with client_id %s',
    async (clientId) => {
      m.claims.mockResolvedValue({
        data: {
          claims: {
            sub: 'verified-subject',
            aud: 'authenticated',
            role: 'authenticated',
            client_id: clientId,
          },
        },
        error: null,
      });
      expect(await (await currentUserProvider()).getCurrentUser()).toEqual({
        userId: 'owner',
        authIdentityId: 'identity',
      });
    },
  );
  it.each(['oauth-client', '', 123, false])(
    'refuses delegated or malformed client_id %s without provisioning',
    async (clientId) => {
      m.claims.mockResolvedValue({
        data: {
          claims: {
            sub: 'verified-subject',
            aud: 'authenticated',
            role: 'authenticated',
            client_id: clientId,
          },
        },
        error: null,
      });
      expect(await (await currentUserProvider()).getCurrentUser()).toBeNull();
      expect(m.find).not.toHaveBeenCalled();
      expect(m.provision).not.toHaveBeenCalled();
      expect(m.user).not.toHaveBeenCalled();
    },
  );
  it.each([
    { aud: 'oauth-client', role: 'authenticated' },
    { aud: 'authenticated', role: 'service_role' },
  ])('rejects non-member claims %j', async (fields) => {
    m.claims.mockResolvedValue({
      data: { claims: { sub: 'verified-subject', ...fields } },
      error: null,
    });
    expect(await (await currentUserProvider()).getCurrentUser()).toBeNull();
    expect(m.user).not.toHaveBeenCalled();
  });
  it('requires signed claims and remote user to identify the same subject', async () => {
    m.user.mockResolvedValue({ data: { user: { id: 'foreign' } }, error: null });
    expect(await (await currentUserProvider()).getCurrentUser()).toBeNull();
    expect(m.find).not.toHaveBeenCalled();
  });
  it('does not trust claims when verification fails', async () => {
    m.claims.mockResolvedValue({ data: null, error: { message: 'invalid' } });
    expect(await (await currentUserProvider()).getCurrentUser()).toBeNull();
    expect(m.user).not.toHaveBeenCalled();
  });
});
