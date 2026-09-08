import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashLineState } from '../src/line/service-line-oauth';
import type * as lineOAuth from '../src/line/service-line-oauth';
const m = vi.hoisted(() => ({
  actor: vi.fn(),
  cookie: vi.fn(),
  project: vi.fn(),
  connection: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  verify: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('@bunshin/observability', () => ({ createLogger: () => ({ warn: vi.fn() }) }));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: m.cookie }) }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
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
  ...(await original<typeof lineOAuth>()),
  verifyServiceLineCode: m.verify,
}));
vi.mock('../src/video/video-render-output-storage', () => ({
  SupabaseVideoRenderOutputStorage: class {
    createDownloadUrl = m.download;
  },
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    videoProject: { findFirst: m.project },
    groupLineConnection: { findFirst: m.connection },
    videoLineAccess: {
      findUnique: m.find,
      create: m.create,
      updateMany: m.claim,
      update: m.update,
      deleteMany: vi.fn(),
    },
  },
}));
import {
  authorizedVideoView,
  downloadVideoView,
  finishVideoLineAccess,
  startVideoLineAccess,
} from '../src/http/video-line-access';
import config from '../next.config';
const id = '00000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(43);
const subject = `U${'b'.repeat(32)}`;
const project = {
  id,
  ownerUserId: 'owner',
  workspaceId: 'workspace',
  groupId: 'group',
  title: 'Private video',
  renderAttempts: [{ id: 'render', outputStorageKey: 'workspace/owner/render.mp4' }],
};
const connection = {
  configurationId: 'configuration',
  providerUserId: subject,
  configuration: { loginChannelId: '123', encryptedLoginSecret: 'encrypted' },
};
const attempt = {
  stateHash: 'hash',
  projectId: id,
  ownerUserId: 'owner',
  configurationId: 'configuration',
  providerHash: hashLineState(subject),
  nonce: 'nonce',
  verifier: 'verifier',
  expiresAt: new Date(Date.now() + 600_000),
  consumedAt: null,
};
const callback = () =>
  finishVideoLineAccess(
    new Request(`https://example.com/auth/video-line/callback?state=${token}&code=code`),
  );
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue(null);
  m.project.mockResolvedValue(project);
  m.connection.mockResolvedValue(connection);
  m.cookie.mockReturnValue({ value: token });
  m.find.mockResolvedValue(attempt);
  m.claim.mockResolvedValue({ count: 1 });
  m.verify.mockResolvedValue({ providerUserId: subject, following: true });
  m.download.mockResolvedValue('https://storage.example/signed-video');
});
describe('LINE video viewing without changing app login', () => {
  it('redirects the already-sent legacy URL before the authenticated layout, preserving management access', async () => {
    expect(await config.redirects!()).toContainEqual({
      source: '/groups/:groupId/videos/:videoProjectId',
      destination: '/video-access/:videoProjectId',
      missing: [{ type: 'query', key: 'manage' }],
      permanent: false,
    });
  });
  it('allows a logged-out browser to start recipient verification but not to download', async () => {
    const response = await startVideoLineAccess(
      new Request('https://example.com/auth/video-line/start', {
        method: 'POST',
        headers: { origin: 'https://example.com' },
        body: new URLSearchParams({ projectId: id }),
      }),
    );
    expect(new URL(response.headers.get('location')!).origin).toBe('https://access.line.me');
    expect(m.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: id,
        ownerUserId: 'owner',
        providerHash: hashLineState(subject),
      }),
    });
    expect((await downloadVideoView(id)).status).toBe(403);
    expect(m.download).not.toHaveBeenCalled();
  });
  it('does not accept another app login as the owner', async () => {
    m.actor.mockResolvedValue({ userId: 'another-app-user' });
    m.cookie.mockReturnValue(undefined);
    expect(await authorizedVideoView(id)).toBeNull();
  });
  it('lets the current application owner view their own video without LINE proof', async () => {
    m.actor.mockResolvedValue({ userId: 'owner' });
    expect(await authorizedVideoView(id)).toMatchObject({ appOwner: true });
    expect((await downloadVideoView(id)).headers.get('location')).toBe(
      'https://storage.example/signed-video',
    );
  });
  it('creates a project-scoped, short-lived HttpOnly cookie only after matching the verified recipient', async () => {
    const response = await callback();
    expect(response.headers.get('location')).toBe(`https://example.com/video-access/${id}`);
    expect(response.headers.get('set-cookie')).toContain(`Path=/video-access/${id}`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(m.update).toHaveBeenCalledWith({
      where: { stateHash: 'hash' },
      data: expect.objectContaining({
        sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        sessionExpiresAt: expect.any(Date),
      }),
    });
  });
  it.each(['recipient', 'cookie', 'expired', 'consumed', 'concurrent', 'configuration', 'owner'])(
    'does not issue access after a %s mismatch',
    async (failure) => {
      if (failure === 'recipient')
        m.verify.mockResolvedValue({ providerUserId: `U${'c'.repeat(32)}`, following: true });
      if (failure === 'cookie') m.cookie.mockReturnValue({ value: 'other' });
      if (failure === 'expired') m.find.mockResolvedValue({ ...attempt, expiresAt: new Date(0) });
      if (failure === 'consumed') m.find.mockResolvedValue({ ...attempt, consumedAt: new Date() });
      if (failure === 'concurrent') m.claim.mockResolvedValue({ count: 0 });
      if (failure === 'configuration')
        m.connection.mockResolvedValue({ ...connection, configurationId: 'other' });
      if (failure === 'owner') m.project.mockResolvedValue({ ...project, ownerUserId: 'other' });
      expect((await callback()).headers.get('location')).toContain('result=failed');
      expect(m.update).not.toHaveBeenCalled();
    },
  );
  it('allows a matching LINE ticket even when the browser has a different app session', async () => {
    m.actor.mockResolvedValue({ userId: 'another-app-user' });
    m.find.mockResolvedValue({
      ...attempt,
      consumedAt: new Date(),
      sessionExpiresAt: new Date(Date.now() + 60_000),
    });
    expect(await authorizedVideoView(id)).toMatchObject({ appOwner: false, project });
    expect((await downloadVideoView(id)).status).toBe(303);
  });
  it.each(['project', 'expiry', 'connection', 'owner', 'storage'])(
    'rejects revoked or mismatched %s access at download time',
    async (failure) => {
      let ticket = {
        ...attempt,
        consumedAt: new Date(),
        sessionExpiresAt: new Date(Date.now() + 60_000),
      };
      if (failure === 'project') ticket = { ...ticket, projectId: 'other' };
      if (failure === 'expiry') ticket.sessionExpiresAt = new Date(0);
      if (failure === 'connection') m.connection.mockResolvedValue(null);
      if (failure === 'owner') m.project.mockResolvedValue({ ...project, ownerUserId: 'other' });
      if (failure === 'storage')
        m.project.mockResolvedValue({
          ...project,
          renderAttempts: [
            { id: 'render', outputStorageKey: 'workspace/another-owner/render.mp4' },
          ],
        });
      m.find.mockResolvedValue(ticket);
      expect((await downloadVideoView(id)).status).toBe(403);
      expect(m.download).not.toHaveBeenCalled();
    },
  );
});
