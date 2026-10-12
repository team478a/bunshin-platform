import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  social: vi.fn(),
  training: vi.fn(),
  construct: vi.fn(),
  read: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('../src/services/improvement-feedback-admin-data', () => ({
  hasServiceSocialFeedbackSurface: fake.social,
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({
    APP_ENV: 'production',
    SESSION_SECRET: 'synthetic-overview-secret-not-a-live-key',
  }),
}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ info: fake.info, error: fake.error }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: { serviceProgram: { findFirst: fake.training } },
  PrismaServiceImprovementOverviewReader: class {
    constructor(client: unknown, scope: unknown) {
      fake.construct(client, scope);
    }
    read = fake.read;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`LOGIN:${url}`);
  },
}));
vi.mock('../app/ui/public-shell', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import Page from '../app/s/[serviceSlug]/manage/improvement-overview/page';
import {
  availableOverviewPackages,
  loadServiceOverviewPreview,
} from '../src/services/service-improvement-admin-data';
import { feedbackPreviewWindow } from '../src/services/improvement-feedback-admin-preview';
import { fixtureOverview, overviewClock } from './service-improvement-overview-fixture';
const scope = { workspaceId: 'workspace', serviceId: 'service' };
const window = feedbackPreviewWindow({}, overviewClock);
if (window.outcome !== 'WINDOW') throw new Error('fixture');
const page = () => Page({ params: Promise.resolve({ serviceSlug: 'synthetic' }) });
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(overviewClock);
  fake.actor.mockResolvedValue({ userId: 'manager' });
  fake.service.mockResolvedValue({
    ...scope,
    serviceRole: 'SERVICE_ADMIN',
    configuration: { slug: 'canonical' },
  });
  fake.social.mockResolvedValue(true);
  fake.training.mockResolvedValue({ id: 'PRIVATE_PROGRAM' });
  fake.read.mockResolvedValue(await fixtureOverview());
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external forbidden');
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('overview page and trusted server composition', () => {
  it('authorizes before probing and presents both scoped capabilities without an automatic source read', async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('利用記録と改善の確認');
    expect(html).toContain('AI研修');
    expect(html).toContain('SNS運用支援');
    expect(html).toContain('/s/canonical/manage');
    expect(html).toContain('原本の環境');
    expect(html).not.toContain('PRIVATE_');
    expect(fake.service).toHaveBeenCalledWith('synthetic', 'manager', 'ADMINISTRATION');
    expect(fake.read).not.toHaveBeenCalled();
    expect(fake.training).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'service',
        settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
      },
      select: { id: true },
    });
  });
  it('redirects signed-out users before scope or probes', async () => {
    fake.actor.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('LOGIN:/login?returnTo=');
    expect(fake.service).not.toHaveBeenCalled();
    expect(fake.training).not.toHaveBeenCalled();
  });
  it.each(['PARTICIPANT', 'CONTENT_EDITOR', 'PLATFORM_ADMIN'])(
    'denies %s before probes',
    async (serviceRole) => {
      fake.service.mockResolvedValue({ ...scope, serviceRole });
      await expect(page()).rejects.toThrow('NOT_FOUND');
      expect(fake.social).not.toHaveBeenCalled();
      expect(fake.training).not.toHaveBeenCalled();
    },
  );
  it('does not expose unsupported services and never grants by brand alone', async () => {
    fake.social.mockResolvedValue(false);
    fake.training.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('NOT_FOUND');
    expect(fake.read).not.toHaveBeenCalled();
  });
  it('isolates capability/history selection', async () => {
    fake.social.mockResolvedValue(false);
    expect(await availableOverviewPackages(scope)).toEqual(['TRAINING']);
    fake.social.mockResolvedValue(true);
    fake.training.mockResolvedValue(null);
    expect(await availableOverviewPackages(scope)).toEqual(['SOCIAL']);
  });
  it('uses trusted configured environment but never claims the records came from production', async () => {
    const result = await loadServiceOverviewPreview({
      ...scope,
      actorUserId: 'manager',
      window,
      packageKey: 'SOCIAL',
    });
    expect(fake.construct).toHaveBeenCalledWith(expect.anything(), {
      ...scope,
      tenantRef: 'workspace',
      environment: 'PRODUCTION',
    });
    expect(fake.read).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'manager', limit: 1000 }),
      'SOCIAL',
    );
    expect(JSON.stringify(result)).not.toContain('PRODUCTION');
    expect(fetch).not.toHaveBeenCalled();
    expect(fake.info).toHaveBeenCalledTimes(2);
    const audit = JSON.stringify(fake.info.mock.calls);
    for (const raw of ['manager', 'workspace', 'PRIVATE_', 'synthetic-overview-secret'])
      expect(audit).not.toContain(raw);
    expect(fake.info.mock.calls[0]?.[1]).toMatchObject({
      actorRef: expect.stringMatching(/^[a-f0-9]{64}$/),
      scopeRef: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: 'STARTED',
    });
  });
  it('denies revoked DB authorization and never logs raw private exceptions', async () => {
    fake.read.mockRejectedValue(new ApplicationError('NOT_FOUND', 'PRIVATE_SECRET'));
    await expect(
      loadServiceOverviewPreview({
        ...scope,
        actorUserId: 'manager',
        window,
        packageKey: 'SOCIAL',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fake.error).not.toHaveBeenCalled();
    expect(JSON.stringify(fake.info.mock.calls)).not.toContain('PRIVATE_SECRET');
  });
  it('does not turn source or projection errors into successful zero', async () => {
    fake.read.mockRejectedValue(new Error('PRIVATE_DATABASE_URL'));
    await expect(
      loadServiceOverviewPreview({
        ...scope,
        actorUserId: 'manager',
        window,
        packageKey: 'SOCIAL',
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(JSON.stringify(fake.error.mock.calls)).not.toContain('PRIVATE_DATABASE_URL');
    fake.read.mockResolvedValue({ ...(await fixtureOverview()), version: 'unknown' });
    await expect(
      loadServiceOverviewPreview({
        ...scope,
        actorUserId: 'manager',
        window,
        packageKey: 'SOCIAL',
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
  });
  it('does not mask unexpected resolver failures as authorization denials', async () => {
    fake.service.mockRejectedValue(new Error('DB failed'));
    await expect(page()).rejects.toThrow('DB failed');
    expect(fake.training).not.toHaveBeenCalled();
  });
});
