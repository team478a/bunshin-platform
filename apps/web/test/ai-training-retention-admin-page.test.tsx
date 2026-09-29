import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationError } from '@bunshin/shared';
import type { TrainingRetentionPreviewSummary } from '@bunshin/capability-training';

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
  PrismaTrainingRetentionAdminPreviewRepository: class {
    preview = fake.preview;
  },
}));
import Page from '../app/s/[serviceSlug]/manage/training/retention/page';
import { TrainingRetentionSummary } from '../app/s/[serviceSlug]/manage/training/retention/retention-summary';

const summary: TrainingRetentionPreviewSummary = {
  policyVersion: 'TRAINING_RETENTION_V1',
  mode: 'DRY_RUN',
  enrollments: 2,
  answersAndEvaluationsDue: 5,
  workProfilesDue: 1,
  scoreProfilesDue: 1,
  progressSnapshotsDue: 1,
  retainedToolkit: 3,
  endDateUnresolved: 1,
  ownershipUnresolved: 0,
};
const checkedAt = new Date('2026-09-29T01:00:00Z');
const page = () => Page({ params: Promise.resolve({ serviceSlug: 'training' }) });
describe('retention admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    fake.preview.mockResolvedValue({ outcome: 'PREVIEW', summary });
  });
  it('uses authenticated service scope and only renders counts', async () => {
    const html = renderToStaticMarkup(await page());
    expect(fake.service).toHaveBeenCalledWith('training', 'manager');
    expect(fake.preview).toHaveBeenCalledWith({
      workspaceId: 'workspace',
      groupId: 'service',
      actorUserId: 'manager',
      now: expect.any(Date),
    });
    expect(html).toContain('AI研修データの保持期限');
    expect(html).toContain('読み取り専用');
    expect(html).toContain('終了日が不明');
    expect(html).toContain('5</strong>');
    expect(html).toContain('判定保留があります');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('retention-execution');
  });
  it('redirects a signed-out user before reading retention data', async () => {
    fake.actor.mockResolvedValue(null);
    await expect(page()).rejects.toThrow('LOGIN:/login?returnTo=');
    expect(fake.preview).not.toHaveBeenCalled();
  });
  it.each([new Error('SERVICE_NOT_FOUND'), new ApplicationError('NOT_FOUND', 'missing')])(
    'rejects management access failures',
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
  it('does not disguise service resolution database failures as missing membership', async () => {
    fake.service.mockRejectedValue(new Error('Database unavailable'));
    await expect(page()).rejects.toThrow('Database unavailable');
    expect(fake.preview).not.toHaveBeenCalled();
  });
  it('shows an unavailable state without exception text or a successful zero count', async () => {
    fake.preview.mockRejectedValue(new Error('PRIVATE_DATABASE_DETAIL'));
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('0件とは判定していません');
    expect(html).not.toContain('PRIVATE_DATABASE_DETAIL');
    expect(html).not.toContain('保持期限の対象件数');
    expect(fake.log).toHaveBeenCalledOnce();
    expect(JSON.stringify(fake.log.mock.calls)).not.toContain('PRIVATE_DATABASE_DETAIL');
  });
  it('shows bounds without partial metrics', async () => {
    fake.preview.mockResolvedValue({ outcome: 'TOO_LARGE' });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('受講記録100件・プログラム1000件');
    expect(html).not.toContain('保持期限の対象件数');
  });
  it('labels units, retention rules, and the scope of saved Toolkit', () => {
    const html = renderToStaticMarkup(
      <TrainingRetentionSummary
        serviceSlug="training"
        checkedAt={checkedAt}
        result={{ outcome: 'PREVIEW', summary }}
      />,
    );
    expect(html).toContain('2026-09-29T01:00:00.000Z');
    expect(html).toContain('日本時間');
    expect(html).toContain('合算して削除行数');
    expect(html).toContain('保持する全件');
    expect(html).toContain('90日');
    expect(html).toContain('暦年の1年');
    expect(html).toContain('終了日時の補完・定期実行の開始は行いません');
  });
  it('does not present an empty service as an error or a cleared hold', () => {
    const html = renderToStaticMarkup(
      <TrainingRetentionSummary
        serviceSlug="training"
        checkedAt={checkedAt}
        result={{
          outcome: 'PREVIEW',
          summary: {
            ...summary,
            enrollments: 0,
            answersAndEvaluationsDue: 0,
            workProfilesDue: 0,
            scoreProfilesDue: 0,
            progressSnapshotsDue: 0,
            retainedToolkit: 0,
            endDateUnresolved: 0,
          },
        }}
      />,
    );
    expect(html).toContain('保持期限の対象件数');
    expect(html).not.toContain('判定保留があります');
    expect(html).not.toContain('role="alert"');
  });
});
