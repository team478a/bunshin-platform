import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationError } from '@bunshin/shared';

const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  service: vi.fn(),
  preview: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('@bunshin/observability', () => ({ createLogger: () => ({ error: fake.log }) }));
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
vi.mock('@bunshin/database', () => ({
  PrismaTrainingEnrollmentExpiryAdminPreviewRepository: class {
    preview = fake.preview;
  },
}));

import Page from '../app/s/[serviceSlug]/manage/training/expiry/page';
import { TrainingEnrollmentExpirySummary } from '../app/s/[serviceSlug]/manage/training/expiry/expiry-summary';

const checkedAt = new Date('2026-10-01T00:30:00Z');
const page = () => Page({ params: Promise.resolve({ serviceSlug: 'ai-training' }) });

describe('training enrollment expiry admin preview page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    fake.preview.mockResolvedValue({
      outcome: 'PREVIEW',
      summary: {
        eligible: 3,
        batchLimit: 100,
        requiredBatches: 1,
        hasMore: false,
        cutoffAt: checkedAt.toISOString(),
      },
    });
  });

  it('uses authenticated service scope and renders only aggregate counts', async () => {
    const html = renderToStaticMarkup(await page());
    expect(fake.service).toHaveBeenCalledWith('ai-training', 'manager');
    expect(fake.preview).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      groupId: 'service',
      actorUserId: 'manager',
      now: expect.any(Date),
    });
    expect(html).toContain('AI研修の期限終了対象');
    expect(html).toContain('読み取り専用');
    expect(html).toContain('対象の受講記録');
    expect(html).toContain('3</strong>');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('expire-enrollments');
  });

  it('redirects a signed-out user before reading the preview', async () => {
    fake.actor.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('LOGIN:/login?returnTo=');
    expect(fake.preview).not.toHaveBeenCalled();
  });

  it.each([new Error('SERVICE_NOT_FOUND'), new ApplicationError('FORBIDDEN', 'denied')])(
    'rejects service management access failures',
    async (error) => {
      fake.service.mockRejectedValue(error);
      await expect(page()).rejects.toThrow('NOT_FOUND');
      expect(fake.preview).not.toHaveBeenCalled();
    },
  );

  it('fails closed if database authorization changed', async () => {
    fake.preview.mockResolvedValue({ outcome: 'FORBIDDEN' });
    await expect(page()).rejects.toThrow('NOT_FOUND');
  });

  it('shows an unavailable state without exception text or a false zero', async () => {
    fake.preview.mockRejectedValue(new Error('PRIVATE_DATABASE_DETAIL'));
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('0件とは判定していません');
    expect(html).not.toContain('PRIVATE_DATABASE_DETAIL');
    expect(html).not.toContain('対象の受講記録');
    expect(fake.log).toHaveBeenCalledOnce();
    expect(JSON.stringify(fake.log.mock.calls)).not.toContain('PRIVATE_DATABASE_DETAIL');
  });

  it('warns when more than one bounded execution would be required', () => {
    const html = renderToStaticMarkup(
      <TrainingEnrollmentExpirySummary
        serviceSlug="ai-training"
        checkedAt={checkedAt}
        result={{
          outcome: 'PREVIEW',
          summary: {
            eligible: 201,
            batchLimit: 100,
            requiredBatches: 3,
            hasMore: true,
            cutoffAt: checkedAt.toISOString(),
          },
        }}
      />,
    );
    expect(html).toContain('連続実行の承認なしに処理を開始しません');
    expect(html).toContain('課金済み受講の終了');
    expect(html).not.toContain('<form');
  });
});
