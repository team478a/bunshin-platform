import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as serviceLineOAuth from '../src/line/service-line-oauth';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  bunshin: vi.fn(),
  membership: vi.fn(),
  configuration: vi.fn(),
  attempt: vi.fn(),
  claim: vi.fn(),
  createAttempt: vi.fn(),
  cookie: vi.fn(),
  allCookies: vi.fn(),
  verify: vi.fn(),
  connect: vi.fn(),
  connectionUpdate: vi.fn(),
  preference: vi.fn(),
  allowed: vi.fn(),
  recipient: vi.fn(),
  renderUpdate: vi.fn(),
  job: vi.fn(),
  log: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ error: m.log }),
  requestIdFromHeader: () => 'request-id',
}));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: m.cookie, getAll: m.allCookies }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolveMemberServiceContext: m.service,
}));
vi.mock('../src/line/secure-configuration', () => ({
  currentLineEnvironment: () => 'PRODUCTION',
  AesGcmLineSecretCrypto: class {
    decrypt() {
      return 'secret';
    }
  },
}));
vi.mock('../src/line/service-line-oauth', async (original) => ({
  ...(await original<typeof serviceLineOAuth>()),
  verifyServiceLineCode: m.verify,
}));
vi.mock('@bunshin/database', () => {
  const prisma = {
    bunshin: { findFirst: m.bunshin },
    groupMembership: { findFirst: m.membership },
    groupLineChannelConfiguration: { findFirst: m.configuration },
    serviceLineLinkAttempt: {
      findUnique: m.attempt,
      updateMany: m.claim,
      create: m.createAttempt,
      deleteMany: vi.fn(),
    },
    groupLineConnection: { updateMany: m.connectionUpdate },
    lineNotificationPreference: { upsert: m.preference },
    videoRender: { updateMany: m.renderUpdate },
    job: { create: m.job },
  };
  return {
    prisma: { ...prisma, $transaction: (fn: (tx: typeof prisma) => unknown) => fn(prisma) },
    PrismaGroupLineConnectionRepository: class {
      connectVerified = m.connect;
    },
    PrismaLineDeliveryPreferenceRepository: class {
      isAllowed = m.allowed;
    },
    PrismaLineConnectionRepository: class {
      resolve = m.recipient;
    },
  };
});
import {
  finishServiceLineLink,
  retryCompletedVideoNotice,
  serviceLineLinkScope,
  startServiceLineLink,
} from '../src/http/service-line-link';
import { lineLinkAttemptCookie, lineLinkCookie } from '../src/line/service-line-oauth';
const id = '00000000-0000-4000-8000-000000000001';
const renderId = '00000000-0000-4000-8000-000000000002';
const state = 'a'.repeat(43);
const attempt = {
  stateHash: 'hash',
  actorUserId: 'owner',
  bunshinId: id,
  configurationId: 'configuration',
  serviceSlug: 'service',
  nonce: 'nonce',
  verifier: 'verifier',
  consumedAt: null,
  expiresAt: new Date(Date.now() + 600_000),
};
const config = {
  id: 'configuration',
  loginChannelId: '123',
  encryptedLoginSecret: 'encrypted',
  globallyPaused: false,
};
const callback = () =>
  finishServiceLineLink(
    new Request(`https://example.com/auth/service-line/callback?state=${state}&code=code`),
  );
const post = (
  path: string,
  override: Record<string, string> = {},
  origin = 'https://example.com',
) =>
  new Request(`https://example.com/auth/service-line/${path}`, {
    method: 'POST',
    headers: { origin },
    body: new URLSearchParams({
      serviceSlug: 'service',
      bunshinId: id,
      renderId,
      consent: 'yes',
      ...override,
    }),
  });
const outcome = (response: Response) =>
  new URL(response.headers.get('location')!).searchParams.get('lineResult');
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'owner' });
  m.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'group' });
  m.bunshin.mockResolvedValue({ id, name: 'Bunshin' });
  m.membership.mockResolvedValue({ id: 'membership' });
  m.configuration.mockResolvedValue(config);
  m.attempt.mockResolvedValue(attempt);
  m.cookie.mockImplementation((name: string) =>
    name === lineLinkAttemptCookie(state) ? { value: state } : undefined,
  );
  m.allCookies.mockReturnValue([]);
  m.claim.mockResolvedValue({ count: 1 });
  m.verify.mockResolvedValue({ providerUserId: `U${'a'.repeat(32)}`, following: true });
  m.connect.mockResolvedValue(true);
  m.connectionUpdate.mockResolvedValue({ count: 1 });
  m.allowed.mockResolvedValue(true);
  m.recipient.mockResolvedValue({ providerUserId: 'verified' });
  m.renderUpdate.mockResolvedValue({ count: 1 });
});
describe('service LINE linking', () => {
  it('binds the proof to the current owner and sets a protected browser cookie', async () => {
    const response = await startServiceLineLink(post('start'));
    expect(new URL(response.headers.get('location')!).origin).toBe('https://access.line.me');
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(response.headers.get('set-cookie')).toMatch(/Secure/i);
    const startedState = new URL(response.headers.get('location')!).searchParams.get('state')!;
    expect(response.cookies.get(lineLinkAttemptCookie(startedState))?.value).toBe(startedState);
    expect(response.cookies.get(lineLinkCookie)).toBeUndefined();
    expect(m.createAttempt).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'owner',
        bunshinId: id,
        configurationId: 'configuration',
      }),
    });
    expect(m.bunshin).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 'owner',
          workspaceId: 'workspace',
          groupId: 'group',
          id,
        }),
      }),
    );
  });
  it('opens a private service only through the authenticated member boundary', async () => {
    await serviceLineLinkScope('private-service', id);
    expect(m.service).toHaveBeenCalledWith('private-service', 'owner');
    expect(m.membership).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'group',
        userId: 'owner',
        status: 'ACTIVE',
        consentedAt: { not: null },
      },
      select: { id: true },
    });
  });
  it('rejects a nonmember before any partner or LINE configuration lookup', async () => {
    m.service.mockRejectedValue(new Error('Service membership unavailable'));
    expect(outcome(await startServiceLineLink(post('start')))).toBe('configuration-unavailable');
    expect(m.bunshin).not.toHaveBeenCalled();
    expect(m.createAttempt).not.toHaveBeenCalled();
  });
  it('does not resolve a service or create an attempt without authentication', async () => {
    m.actor.mockResolvedValue(null);
    expect(outcome(await startServiceLineLink(post('start')))).toBe('configuration-unavailable');
    expect(m.service).not.toHaveBeenCalled();
    expect(m.createAttempt).not.toHaveBeenCalled();
  });
  it('preserves all existing proofs when the browser attempt limit is reached', async () => {
    m.allCookies.mockReturnValue(
      ['a', 'b', 'c', 'd'].map((letter) => ({
        name: lineLinkAttemptCookie(letter.repeat(43)),
        value: letter.repeat(43),
      })),
    );
    const response = await startServiceLineLink(post('start'));
    expect(outcome(response)).toBe('attempt-limit');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(m.createAttempt).not.toHaveBeenCalled();
  });
  it.each(['other-service', 'service'])(
    'completes both attempts independently when the next attempt is for %s',
    async (nextSlug) => {
      const browser = new Map<string, string>();
      const rows = new Map<string, typeof attempt>();
      m.allCookies.mockImplementation(() => [...browser].map(([name, value]) => ({ name, value })));
      m.cookie.mockImplementation((name: string) =>
        browser.has(name) ? { value: browser.get(name) } : undefined,
      );
      m.service.mockImplementation((slug: string) =>
        Promise.resolve({ workspaceId: 'workspace', serviceId: slug }),
      );
      m.configuration.mockImplementation(({ where }: { where: { groupId: string } }) =>
        Promise.resolve({ ...config, id: `configuration-${where.groupId}` }),
      );
      m.createAttempt.mockImplementation(({ data }: { data: typeof attempt }) => {
        rows.set(data.stateHash, { ...data, consumedAt: null });
        return Promise.resolve(data);
      });
      m.attempt.mockImplementation(({ where }: { where: { stateHash: string } }) =>
        Promise.resolve(rows.get(where.stateHash)),
      );
      const starts = [
        await startServiceLineLink(post('start')),
        await startServiceLineLink(post('start', { serviceSlug: nextSlug })),
      ];
      for (const response of starts)
        for (const cookie of response.cookies.getAll()) browser.set(cookie.name, cookie.value);
      const states = starts.map((response) =>
        new URL(response.headers.get('location')!).searchParams.get('state')!,
      );
      expect(new Set(states).size).toBe(2);
      for (const [index, currentState] of states.entries()) {
        const response = await finishServiceLineLink(
          new Request(
            `https://example.com/auth/service-line/callback?state=${currentState}&code=code`,
          ),
        );
        expect(outcome(response)).toBe('connected');
        expect(response.cookies.getAll().map(({ name }) => name)).toEqual([
          lineLinkAttemptCookie(currentState),
        ]);
        for (const cookie of response.cookies.getAll()) browser.delete(cookie.name);
        expect(m.connect).toHaveBeenNthCalledWith(
          index + 1,
          expect.objectContaining({
            groupId: index === 0 ? 'service' : nextSlug,
            configurationId: `configuration-${index === 0 ? 'service' : nextSlug}`,
            actorUserId: 'owner',
          }),
        );
      }
      expect(browser.size).toBe(0);
    },
  );
  it.each(['code=old-code', 'error=access_denied'])(
    'does not remove a newer proof after an old unmatched callback (%s)',
    async (query) => {
      const newerState = 'b'.repeat(43);
      m.cookie.mockImplementation((name: string) =>
        name === lineLinkAttemptCookie(newerState) ? { value: newerState } : undefined,
      );
      const response = await finishServiceLineLink(
        new Request(`https://example.com/auth/service-line/callback?state=${state}&${query}`),
      );
      expect(outcome(response)).toBe('session-expired');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(m.claim).not.toHaveBeenCalled();
      expect(m.verify).not.toHaveBeenCalled();
    },
  );
  it('cancels only its matching attempt and lets another service finish afterwards', async () => {
    const nextState = 'b'.repeat(43);
    const browser = new Map([
      [lineLinkAttemptCookie(state), state],
      [lineLinkAttemptCookie(nextState), nextState],
    ]);
    m.cookie.mockImplementation((name: string) =>
      browser.has(name) ? { value: browser.get(name) } : undefined,
    );
    const cancelled = await finishServiceLineLink(
      new Request(
        `https://example.com/auth/service-line/callback?state=${state}&error=access_denied`,
      ),
    );
    expect(outcome(cancelled)).toBe('failed');
    expect(cancelled.cookies.getAll().map(({ name }) => name)).toEqual([
      lineLinkAttemptCookie(state),
    ]);
    for (const cookie of cancelled.cookies.getAll()) browser.delete(cookie.name);
    expect(browser.get(lineLinkAttemptCookie(nextState))).toBe(nextState);
    m.attempt.mockResolvedValue({ ...attempt, serviceSlug: 'other-service' });
    const completed = await finishServiceLineLink(
      new Request(
        `https://example.com/auth/service-line/callback?state=${nextState}&code=next-code`,
      ),
    );
    expect(outcome(completed)).toBe('connected');
    expect(new URL(completed.headers.get('location')!).pathname).toBe(
      `/s/other-service/bunshins/${id}`,
    );
    expect(m.service).toHaveBeenCalledWith('other-service', 'owner');
    expect(m.verify).toHaveBeenCalledTimes(1);
  });
  it('accepts a matching legacy proof without deleting the shared legacy cookie', async () => {
    m.cookie.mockImplementation((name: string) =>
      name === lineLinkCookie ? { value: state } : undefined,
    );
    const response = await callback();
    expect(outcome(response)).toBe('connected');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('does not use a legacy proof to override an invalid attempt proof', async () => {
    m.cookie.mockImplementation((name: string) => ({
      value: name === lineLinkCookie ? state : 'wrong-proof',
    }));
    const response = await callback();
    expect(outcome(response)).toBe('session-expired');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(m.verify).not.toHaveBeenCalled();
  });
  it.each(['', 'bad;cookie=value'])(
    'rejects malformed or missing state without touching browser proofs (%s)',
    async (invalidState) => {
      const response = await finishServiceLineLink(
        new Request(
          `https://example.com/auth/service-line/callback?state=${encodeURIComponent(invalidState)}&code=code`,
        ),
      );
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(m.attempt).not.toHaveBeenCalled();
      expect(m.verify).not.toHaveBeenCalled();
    },
  );
  it('rejects cross-origin requests before creating a proof', async () => {
    expect(outcome(await startServiceLineLink(post('start', {}, 'https://attacker.example')))).toBe(
      'request-invalid',
    );
    expect(m.createAttempt).not.toHaveBeenCalled();
  });
  it('requires explicit notification consent', async () => {
    expect(outcome(await startServiceLineLink(post('start', { consent: 'no' })))).toBe(
      'consent-required',
    );
    expect(m.createAttempt).not.toHaveBeenCalled();
  });
  it('links only the verified subject to the current service member', async () => {
    const response = await callback();
    expect(outcome(response)).toBe('connected');
    expect(new URL(response.headers.get('location')!).pathname).toBe(`/s/service/bunshins/${id}`);
    expect(m.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'owner',
        groupMembershipId: 'membership',
        verifiedProviderUserId: `U${'a'.repeat(32)}`,
        consentGranted: true,
      }),
    );
    expect(m.claim).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nonce: '', verifier: '' }) }),
    );
  });
  it('returns a cancelled LINE authorization to the connection page', async () => {
    const response = await finishServiceLineLink(
      new Request(
        `https://example.com/auth/service-line/callback?state=${state}&error=access_denied`,
      ),
    );
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe(`/s/service/bunshins/${id}/line`);
    expect(outcome(response)).toBe('failed');
    expect(response.cookies.getAll().map(({ name }) => name)).toEqual([
      lineLinkAttemptCookie(state),
    ]);
    expect(m.verify).not.toHaveBeenCalled();
  });
  it.each([
    ['cookie', 'session-expired'],
    ['owner', 'session-changed'],
    ['configuration', 'session-changed'],
    ['expired', 'session-expired'],
    ['consumed', 'session-expired'],
    ['race', 'session-expired'],
    ['membership', 'session-changed'],
    ['bunshin', 'session-changed'],
  ])('rejects %s mismatch or replay without contacting LINE', async (failure, expected) => {
    if (failure === 'cookie') m.cookie.mockReturnValue({ value: 'other' });
    if (failure === 'owner') m.actor.mockResolvedValue({ userId: 'other' });
    if (failure === 'configuration') m.configuration.mockResolvedValue({ ...config, id: 'other' });
    if (failure === 'expired') m.attempt.mockResolvedValue({ ...attempt, expiresAt: new Date(0) });
    if (failure === 'consumed') m.attempt.mockResolvedValue({ ...attempt, consumedAt: new Date() });
    if (failure === 'race') m.claim.mockResolvedValue({ count: 0 });
    if (failure === 'membership') m.membership.mockResolvedValue(null);
    if (failure === 'bunshin') m.bunshin.mockResolvedValue(null);
    expect(outcome(await callback())).toBe(expected);
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.connect).not.toHaveBeenCalled();
  });
  it('reports LINE verification failures without exposing provider credentials', async () => {
    m.verify.mockRejectedValue(new Error('provider detail'));
    expect(outcome(await callback())).toBe('verification-failed');
    expect(JSON.stringify(m.log.mock.calls)).toContain('verification-failed');
    expect(JSON.stringify(m.log.mock.calls)).not.toContain('provider detail');
  });
  it('does not enable notifications if the verified destination conflicts with another member', async () => {
    m.connect.mockRejectedValue(new Error('unique constraint'));
    expect(outcome(await callback())).toBe('destination-in-use');
    expect(m.preference).not.toHaveBeenCalled();
    expect(JSON.stringify(m.log.mock.calls)).not.toContain('code=');
  });
  it('does not update preferences when the connection changes concurrently', async () => {
    m.connectionUpdate.mockResolvedValue({ count: 0 });
    expect(outcome(await callback())).toBe('save-failed');
    expect(m.preference).not.toHaveBeenCalled();
  });
});
describe('completed video notification recovery', () => {
  it('queues the existing successful render with a stable deduplication key', async () => {
    expect(outcome(await retryCompletedVideoNotice(post('retry-video')))).toBe('queued');
    expect(m.renderUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: renderId,
        ownerUserId: 'owner',
        groupId: 'group',
        workspaceId: 'workspace',
        status: 'SUCCEEDED',
        notifiedAt: null,
        notificationStatus: 'CANCELLED',
        notificationErrorCode: 'NOTIFICATION_SUPPRESSED',
        completedAt: { gt: expect.any(Date) },
        project: { bunshinId: id, ownerUserId: 'owner', status: { not: 'CANCELLED' } },
      }),
      data: { notificationStatus: 'PENDING', notificationErrorCode: null },
    });
    expect(m.job).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payloadReference: `video-render:${renderId}`,
        idempotencyKey: `video-notice-recovery:${renderId}`,
      }),
    });
  });
  it.each(['suppressed', 'recipient', 'paused', 'ineligible'])(
    'does not queue a notice when %s',
    async (reason) => {
      if (reason === 'suppressed') m.allowed.mockResolvedValue(false);
      if (reason === 'recipient') m.recipient.mockResolvedValue(null);
      if (reason === 'paused')
        m.configuration.mockResolvedValue({ ...config, globallyPaused: true });
      if (reason === 'ineligible') m.renderUpdate.mockResolvedValue({ count: 0 });
      expect(outcome(await retryCompletedVideoNotice(post('retry-video')))).toBe('failed');
      expect(m.job).not.toHaveBeenCalled();
    },
  );
});
