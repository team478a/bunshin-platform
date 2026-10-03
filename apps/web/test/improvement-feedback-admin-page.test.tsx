import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement, type ReactNode } from 'react';
import { ApplicationError } from '@bunshin/shared';
import {
  BuildImprovementFeedbackReviewEvidence,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION as definition,
  projectImprovementFeedbackObservation,
} from '@bunshin/application';
const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  probe: vi.fn(),
  review: vi.fn(),
  construct: vi.fn(),
  log: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({
    APP_ENV: 'development',
    SESSION_SECRET: 'synthetic-review-session-secret-32-bytes',
  }),
}));
vi.mock('@bunshin/observability', () => ({ createLogger: () => ({ error: fake.log }) }));
vi.mock('@bunshin/database', () => ({
  prisma: { bunshin: { findFirst: fake.probe } },
  PrismaImprovementFeedbackObservationAdapter: class {
    constructor(client: unknown, scope: unknown) {
      fake.construct(client, scope);
    }
    reviewEvidence = fake.review;
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
import Page from '../app/s/[serviceSlug]/manage/improvement-feedback/page';
import {
  feedbackPreviewWindow,
  type FeedbackPreviewQuery,
} from '../src/services/improvement-feedback-admin-preview';
const checkedAt = new Date('2026-10-03T01:30:00Z');
function endpointInTree(node: ReactNode): string | undefined {
  if (Array.isArray(node)) return node.map(endpointInTree).find((value) => value !== undefined);
  if (!isValidElement<{ reviewEndpoint?: string; children?: ReactNode }>(node)) return undefined;
  return node.props.reviewEndpoint ?? endpointInTree(node.props.children);
}
const scope = {
  tenantRef: 'workspace',
  workspaceId: 'workspace',
  serviceId: 'service',
  packageKey: 'SOCIAL',
  adapterKey: definition.key,
  environment: 'DEVELOPMENT' as const,
};
const page = (query: FeedbackPreviewQuery = {}) =>
  Page({
    params: Promise.resolve({ serviceSlug: 'synthetic' }),
    searchParams: Promise.resolve(query),
  });
async function evidence() {
  const window = feedbackPreviewWindow({}, checkedAt);
  if (window.outcome !== 'WINDOW') throw new Error('synthetic window');
  return new BuildImprovementFeedbackReviewEvidence(
    { authorize: () => Promise.resolve(true) },
    {
      definition,
      readObservations: () =>
        Promise.resolve({
          observations: Array.from({ length: 5 }, (_, index) =>
            projectImprovementFeedbackObservation(scope, {
              id: `PRIVATE_RECEIPT_${index}`,
              actorUserId: `PRIVATE_USER_${index}`,
              bunshinId: `PRIVATE_BUNSHIN_${index}`,
              createdAt: new Date('2026-09-23Z'),
              category: 'OPERATION',
              surface: 'TODAY',
              impact: 'BLOCKED',
            }),
          ),
          coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: false },
        }),
    },
  ).execute({
    scope,
    actorUserId: 'manager',
    subject: null,
    limit: 1000,
    fromInclusive: window.fromInclusive,
    toExclusive: window.toExclusive,
  });
}
describe('service feedback admin preview page and server composition', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(checkedAt);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('external communication forbidden');
      }),
    );
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.service.mockResolvedValue({
      workspaceId: 'workspace',
      serviceId: 'service',
      serviceRole: 'SERVICE_ADMIN',
      configuration: { slug: 'canonical', visibility: 'PRIVATE' },
    });
    fake.probe.mockResolvedValue({ id: 'PRIVATE_BUNSHIN' });
    fake.review.mockResolvedValue(await evidence());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('reads an authenticated private service with fixed scope and only renders the projected model', async () => {
    const rendered = await page();
    const html = renderToStaticMarkup(rendered);
    expect(fake.service).toHaveBeenCalledWith('synthetic', 'manager', 'ADMINISTRATION');
    expect(fake.construct).toHaveBeenCalledWith(expect.anything(), scope);
    expect(fake.review).toHaveBeenCalledWith({
      scope,
      actorUserId: 'manager',
      subject: null,
      limit: 1000,
      fromInclusive: new Date('2026-09-20T15:00:00Z'),
      toExclusive: new Date('2026-09-27T15:00:00Z'),
    });
    expect(fake.probe).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace',
        groupId: 'service',
        OR: [
          { capabilityAssignments: { some: { capabilityType: 'SOCIAL' } } },
          {
            improvementFeedback: {
              some: { workspaceId: 'workspace', serviceId: 'service', packageKey: 'SOCIAL' },
            },
          },
        ],
      },
      select: { id: true },
    });
    expect(html).toContain('人手確認');
    expect(html).toContain('確認を始める');
    expect(endpointInTree(rendered)).toBe('/api/services/canonical/improvement-feedback/review');
    expect(html).toContain('/s/canonical/manage/improvement-feedback?week=2026-09-21');
    expect(html).toContain('保存報告 5件');
    expect(html).not.toContain('PRIVATE_');
    expect(html).not.toContain('clusterRef');
    expect(html).not.toContain('evidenceRevision');
    expect(html).not.toContain('<form');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('redirects signed-out users before any service or report read', async () => {
    fake.actor.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('LOGIN:/login?returnTo=');
    expect(fake.service).not.toHaveBeenCalled();
    expect(fake.probe).not.toHaveBeenCalled();
    expect(fake.review).not.toHaveBeenCalled();
  });
  it.each(['CONTENT_EDITOR', 'PARTICIPANT', 'PLATFORM_ADMIN'])(
    'refuses %s without widening to cross-service rights',
    async (serviceRole) => {
      fake.service.mockResolvedValue({
        workspaceId: 'workspace',
        serviceId: 'service',
        serviceRole,
        configuration: { slug: 'canonical' },
      });
      await expect(page()).rejects.toThrow('NOT_FOUND');
      expect(fake.review).not.toHaveBeenCalled();
      expect(fake.probe).not.toHaveBeenCalled();
    },
  );
  it.each([
    new Error('SERVICE_NOT_FOUND'),
    new ApplicationError('FORBIDDEN', 'private'),
    new ApplicationError('NOT_FOUND', 'private'),
  ])('denies resolver authorization failures before evidence reads', async (error) => {
    fake.service.mockRejectedValue(error);
    await expect(page()).rejects.toThrow('NOT_FOUND');
    expect(fake.review).not.toHaveBeenCalled();
  });
  it('does not disguise unexpected resolver failure as missing membership', async () => {
    fake.service.mockRejectedValue(new Error('database unavailable'));
    await expect(page()).rejects.toThrow('database unavailable');
    expect(fake.review).not.toHaveBeenCalled();
  });
  it('does not connect services without explicit SOCIAL capability or historical SOCIAL feedback', async () => {
    fake.probe.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('NOT_FOUND');
    expect(fake.review).not.toHaveBeenCalled();
  });
  it.each([
    new ApplicationError('NOT_FOUND', 'private'),
    new ApplicationError('FORBIDDEN', 'private'),
  ])('reauthorizes in the DB adapter and refuses lost permissions', async (error) => {
    fake.review.mockRejectedValue(error);
    await expect(page()).rejects.toThrow('NOT_FOUND');
    expect(fake.log).not.toHaveBeenCalled();
  });
  it('shows unavailable instead of zero and logs no raw DB exception', async () => {
    fake.review.mockRejectedValue(new Error('PRIVATE_DB_TOKEN'));
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('0件とは判定していません');
    expect(html).not.toContain('保存報告 0件');
    expect(html).not.toContain('PRIVATE_DB_TOKEN');
    expect(fake.log).toHaveBeenCalledOnce();
    expect(JSON.stringify(fake.log.mock.calls)).not.toContain('PRIVATE_DB_TOKEN');
  });
  it.each([
    'serviceId',
    'workspaceId',
    'userRef',
    'bunshinRef',
    'packageKey',
    'limit',
    'from',
    'to',
  ])('rejects query %s instead of accepting arbitrary scope/period filters', async (key) => {
    const html = renderToStaticMarkup(await page({ [key]: 'PRIVATE_INPUT' }));
    expect(html).toContain('追加の絞り込み指定は受け付けません');
    expect(html).not.toContain('PRIVATE_INPUT');
    expect(fake.review).not.toHaveBeenCalled();
  });
  it('rejects ongoing and duplicated week queries without report reads', async () => {
    for (const week of ['2026-09-28', ['2026-09-21', '2026-09-14']]) {
      const html = renderToStaticMarkup(await page({ week }));
      expect(html).toContain('表示できる週を選び直し');
    }
    expect(fake.review).not.toHaveBeenCalled();
  });
  it('fails safely when a future adapter returns foreign scope or subject-specific evidence', async () => {
    const original = await evidence();
    fake.review.mockResolvedValue({ ...original, scope: { ...scope, serviceId: 'foreign' } });
    expect(renderToStaticMarkup(await page())).toContain('0件とは判定していません');
    fake.review.mockResolvedValue({
      ...original,
      selection: { kind: 'SUBJECT', revision: 'PRIVATE_DIGEST' },
    });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('0件とは判定していません');
    expect(html).not.toContain('PRIVATE_DIGEST');
  });
});
