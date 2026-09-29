import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { TrainingLifecycleCard } from '../app/s/[serviceSlug]/manage/training/training-lifecycle-card';
const row = {
  enrollmentId: 'e',
  status: 'ACTIVE' as const,
  displayStatus: 'ACTIVE' as const,
  startsAt: '2026-09-01T00:00:00Z',
  endsAt: null,
  updatedAt: '2026-09-29T00:00:00Z',
  endedAt: null,
};
describe('training lifecycle confirmation UI', () => {
  it('shows effective expiry separately from ACTIVE registration and leaves confirmed end unresolved', () => {
    const html = renderToStaticMarkup(
      <TrainingLifecycleCard
        serviceSlug="training"
        row={{ ...row, displayStatus: 'PERIOD_ENDED', endsAt: '2026-09-29T01:00:00Z' }}
      />,
    );
    expect(html).toContain('期限終了（状態未更新）');
    expect(html).toContain('登録状態：受講中');
    expect(html).toContain('予定終了日時');
    expect(html).toContain('確定終了日時：未確定');
    expect(html).toContain('データ保持期限は変更しません');
    expect(html).toContain('研修を終了');
    expect(html).not.toContain('受講を再開');
  });
  it('shows active end/cancel but no initial confirmation or reopen', () => {
    const html = renderToStaticMarkup(<TrainingLifecycleCard serviceSlug="training" row={row} />);
    expect(html).toContain('研修を終了');
    expect(html).toContain('受講を取消');
    expect(html).not.toContain('受講を再開');
    expect(html).not.toContain('を確定');
  });
  it('keeps cancelled enrollment visible for reopen and does not invent past end dates', () => {
    const html = renderToStaticMarkup(
      <TrainingLifecycleCard
        serviceSlug="training"
        row={{ ...row, status: 'CANCELLED', displayStatus: 'CANCELLED' }}
      />,
    );
    expect(html).toContain('受講を再開');
    expect(html).toContain('未確定');
    expect(html).not.toContain('研修を終了');
  });
  it('requires reason and unchecked confirmation and resets after conflicts', () => {
    const source = readFileSync(
      new URL(
        '../app/s/[serviceSlug]/manage/training/training-lifecycle-card.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain('CHANGE_TRAINING_STATUS');
    expect(source).toContain('expectedUpdatedAt: row.updatedAt');
    expect(source).toContain('useState(false)');
    expect(source).toContain('response.status === 409');
    expect(source).toContain('!confirmed || !reason.trim() || busy');
    expect(source).not.toMatch(/console\.|localStorage/);
  });
});
