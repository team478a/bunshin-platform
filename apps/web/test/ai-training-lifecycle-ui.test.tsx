import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { TrainingLifecycleCard } from '../app/s/[serviceSlug]/manage/training/training-lifecycle-card';
const row = {
  enrollmentId: 'e',
  status: 'ACTIVE' as const,
  updatedAt: '2026-09-29T00:00:00Z',
  endedAt: null,
};
describe('training lifecycle confirmation UI', () => {
  it('shows active end/cancel but no initial confirmation or reopen', () => {
    const html = renderToStaticMarkup(<TrainingLifecycleCard serviceSlug="training" row={row} />);
    expect(html).toContain('研修を終了');
    expect(html).toContain('受講を取消');
    expect(html).not.toContain('受講を再開');
    expect(html).not.toContain('を確定');
  });
  it('keeps cancelled enrollment visible for reopen and does not invent past end dates', () => {
    const html = renderToStaticMarkup(
      <TrainingLifecycleCard serviceSlug="training" row={{ ...row, status: 'CANCELLED' }} />,
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
