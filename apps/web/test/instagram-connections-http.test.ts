import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  findAttempt: vi.fn(),
  claim: vi.fn(),
  createAttempt: vi.fn(),
  deleteAttempts: vi.fn(),
  countAttempts: vi.fn(),
  configuration: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  disconnect: vi.fn(),
  authorizationUrl: vi.fn(),
  exchangeCode: vi.fn(),
}));

vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/providers/instagram-login', () => ({
  instagramLoginAdapter: () => ({
    authorizationUrl: m.authorizationUrl,
    exchangeCode: m.exchangeCode,
  }),
}));
vi.mock('../src/services/social-account-connection-owner', () => ({
  socialAccountConnectionOwner: (_slug: string, bunshinId: string, actorUserId: string) =>
    Promise.resolve({
      owner: {
        workspaceId: 'workspace',
        serviceId: 'group',
        groupMembershipId: 'membership',
        userId: actorUserId,
        bunshinId,
      },
      targetName: 'Bunshin',
      serviceName: 'Service',
    }),
  socialAccountConnections: () =>
    Promise.resolve({ list: m.list, save: m.save, disconnect: m.disconnect }),
}));
vi.mock('@bunshin/database', () => {
  const tx = {
    socialOAuthAttempt: {
      findUnique: m.findAttempt,
      updateMany: m.claim,
      create: m.createAttempt,
      deleteMany: m.deleteAttempts,
      count: m.countAttempts,
    },
    serviceConfiguration: { findFirst: m.configuration },
  };
  return { prisma: { ...tx, $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) } };
});

import {
  disconnectInstagramConnection,
  finishInstagramConnection,
  startInstagramConnection,
} from '../src/http/instagram-connections';

const bunshinId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
const state = 'a'.repeat(43);
const stateHash = createHash('sha256').update(state).digest('hex');
const cookieName = `instagram_oauth_${stateHash.slice(0, 20)}`;
const callbackRequest = (query: string, cookie = state) =>
  new Request(`https://example.com/auth/instagram/callback?state=${state}&${query}`, {
    headers: { cookie: `${cookieName}=${cookie}` },
  });

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'owner' });
  m.countAttempts.mockResolvedValue(0);
  m.createAttempt.mockResolvedValue({});
  m.authorizationUrl.mockImplementation(
    (value: string) => `https://www.instagram.com/oauth/authorize?state=${value}`,
  );
  m.findAttempt.mockResolvedValue({
    stateHash,
    workspaceId: 'workspace',
    groupId: 'group',
    groupMembershipId: 'membership',
    userId: 'owner',
    bunshinId,
    platform: 'INSTAGRAM',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  });
  m.configuration.mockResolvedValue({ slug: 'official-service' });
  m.claim.mockResolvedValue({ count: 1 });
  m.list.mockResolvedValue([]);
  m.exchangeCode.mockResolvedValue({
    platform: 'INSTAGRAM',
    externalAccountId: '17841400000000000',
    displayName: 'official.account',
    scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
    accessToken: 'PRIVATE_TOKEN',
    tokenExpiresAt: new Date(Date.now() + 60_000),
  });
});

describe('Instagram connection HTTP flow', () => {
  it('rejects a cross-origin start before creating OAuth state', async () => {
    await expect(
      startInstagramConnection(
        new Request('https://example.com/start', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
        }),
        'official-service',
        bunshinId,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.createAttempt).not.toHaveBeenCalled();
  });

  it('stores scoped state only after reauthorization and sets an httpOnly proof cookie', async () => {
    const response = await startInstagramConnection(
      new Request('https://example.com/start', {
        method: 'POST',
        headers: { origin: 'https://example.com' },
      }),
      'official-service',
      bunshinId,
    );
    expect(m.list).toHaveBeenCalledOnce();
    expect(m.createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'owner', bunshinId, platform: 'INSTAGRAM' }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly.*SameSite=lax/i);
  });

  it('claims state before exchange and persists through the encrypted repository path', async () => {
    const response = await finishInstagramConnection(callbackRequest('code=provider-code'));
    expect(m.claim).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ consumedAt: null }) }),
    );
    expect(m.exchangeCode).toHaveBeenCalledWith({ code: 'provider-code' });
    expect(m.save).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ bunshinId }),
      expect.objectContaining({ accessToken: 'PRIVATE_TOKEN' }),
    );
    expect(response.headers.get('location')).toContain('instagramResult=connected');
    expect([...response.headers.entries()].join(' ')).not.toContain('PRIVATE_TOKEN');
  });

  it.each([
    ['replay', state, { userId: 'owner' }, 0],
    ['browser proof mismatch', 'wrong', { userId: 'owner' }, 1],
    ['session change', state, { userId: 'other' }, 1],
    ['membership scope change', state, { userId: 'owner' }, 1],
  ])('rejects %s without contacting Instagram', async (_case, cookie, actor, claimCount) => {
    m.actor.mockResolvedValue(actor);
    m.claim.mockResolvedValue({ count: claimCount });
    if (_case === 'membership scope change')
      m.findAttempt.mockResolvedValue({
        ...(await m.findAttempt()),
        groupMembershipId: 'old-membership',
      });
    const response = await finishInstagramConnection(callbackRequest('code=provider-code', cookie));
    expect(response.headers.get('location')).toContain('instagramResult=expired');
    expect(m.exchangeCode).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });

  it('reauthorizes a same-origin disconnect and is idempotent in the repository', async () => {
    const response = await disconnectInstagramConnection(
      new Request('https://example.com/disconnect', {
        method: 'POST',
        headers: { origin: 'https://example.com' },
      }),
      'official-service',
      bunshinId,
      connectionId,
    );
    expect(m.disconnect).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ bunshinId }),
      connectionId,
    );
    expect(response.status).toBe(303);
  });
});
