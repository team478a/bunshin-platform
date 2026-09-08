import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as serviceLineOAuth from '../src/line/service-line-oauth';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  bunshin: vi.fn(),
  membership: vi.fn(),
  configuration: vi.fn(),
  attempt: vi.fn(),
  claim: vi.fn(),
  createAttempt: vi.fn(),
  cookie: vi.fn(),
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
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: m.cookie }) }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({
  resolvePublicServiceContext: () =>
    Promise.resolve({ workspaceId: 'workspace', serviceId: 'group' }),
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
  startServiceLineLink,
} from '../src/http/service-line-link';
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
  m.bunshin.mockResolvedValue({ id, name: 'Bunshin' });
  m.membership.mockResolvedValue({ id: 'membership' });
  m.configuration.mockResolvedValue(config);
  m.attempt.mockResolvedValue(attempt);
  m.cookie.mockReturnValue({ value: state });
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
  it('rejects cross-origin requests before creating a proof', async () => {
    expect(outcome(await startServiceLineLink(post('start', {}, 'https://attacker.example')))).toBe(
      'failed',
    );
    expect(m.createAttempt).not.toHaveBeenCalled();
  });
  it('requires explicit notification consent', async () => {
    expect(outcome(await startServiceLineLink(post('start', { consent: 'no' })))).toBe('failed');
    expect(m.createAttempt).not.toHaveBeenCalled();
  });
  it('links only the verified subject to the current service member', async () => {
    expect(outcome(await callback())).toBe('connected');
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
  it.each([
    'cookie',
    'owner',
    'configuration',
    'expired',
    'consumed',
    'race',
    'membership',
    'bunshin',
  ])('rejects %s mismatch or replay without contacting LINE', async (failure) => {
    if (failure === 'cookie') m.cookie.mockReturnValue({ value: 'other' });
    if (failure === 'owner') m.actor.mockResolvedValue({ userId: 'other' });
    if (failure === 'configuration') m.configuration.mockResolvedValue({ ...config, id: 'other' });
    if (failure === 'expired') m.attempt.mockResolvedValue({ ...attempt, expiresAt: new Date(0) });
    if (failure === 'consumed') m.attempt.mockResolvedValue({ ...attempt, consumedAt: new Date() });
    if (failure === 'race') m.claim.mockResolvedValue({ count: 0 });
    if (failure === 'membership') m.membership.mockResolvedValue(null);
    if (failure === 'bunshin') m.bunshin.mockResolvedValue(null);
    expect(outcome(await callback())).toBe('failed');
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.connect).not.toHaveBeenCalled();
  });
  it('does not enable notifications if the verified destination conflicts with another member', async () => {
    m.connect.mockRejectedValue(new Error('unique constraint'));
    expect(outcome(await callback())).toBe('failed');
    expect(m.preference).not.toHaveBeenCalled();
    expect(JSON.stringify(m.log.mock.calls)).not.toContain('code=');
  });
  it('does not update preferences when the connection changes concurrently', async () => {
    m.connectionUpdate.mockResolvedValue({ count: 0 });
    expect(outcome(await callback())).toBe('failed');
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
