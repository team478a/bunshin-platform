import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { TrainingEndDateCard } from '../app/s/[serviceSlug]/manage/training/training-end-date-card';
import { trainingEndDateFromJst } from '../src/services/ai-training-end-date-input';
const row = {
  enrollmentId: 'e',
  status: 'COMPLETED' as const,
  displayStatus: 'COMPLETED' as const,
  startsAt: null,
  endsAt: null,
  updatedAt: '2026-09-29T00:00:00Z',
  endedAt: null,
};
describe('end date confirmation UI', () => {
  it('initially requests evidence/date in Japan time, with no preset or confirmation button', () => {
    const html = renderToStaticMarkup(<TrainingEndDateCard serviceSlug="training-a" row={row} />);
    expect(html).toContain('日本時間');
    expect(html).toContain('根拠・理由');
    expect(html).toContain('自動推定・一括補完は行いません');
    expect(html).toContain('本番の期限処理も開始しません');
    expect(html).toContain('value=""');
    expect(html).toContain('確定前に確認');
    expect(html).not.toContain('終了日時を確定</button>');
    expect(html).not.toContain('checked=""');
  });
  it.each(['ACTIVE', 'INVITED'] as const)('has no end-date mutation UI for %s', (status) => {
    expect(
      renderToStaticMarkup(<TrainingEndDateCard serviceSlug="training" row={{ ...row, status }} />),
    ).toBe('');
  });
  it('never offers overwrite for established dates', () => {
    expect(
      renderToStaticMarkup(
        <TrainingEndDateCard
          serviceSlug="training"
          row={{ ...row, endedAt: '2025-01-01T00:00:00Z' }}
        />,
      ),
    ).toBe('');
    expect(
      renderToStaticMarkup(
        <TrainingEndDateCard
          serviceSlug="training"
          row={{ ...row, status: 'EXPIRED', endsAt: '2025-01-01T00:00:00Z' }}
        />,
      ),
    ).toBe('');
  });
  it('converts explicit JST independently of device zone and rejects rolled dates', () => {
    expect(trainingEndDateFromJst('2025-08-01T09:00')).toBe('2025-08-01T00:00:00.000Z');
    expect(trainingEndDateFromJst('2024-02-29T00:00')).toBe('2024-02-28T15:00:00.000Z');
    for (const value of [
      '2025-02-29T12:00',
      '2025-02-30T12:00',
      '2025-08-01T25:00',
      '',
      '2025-08-01',
    ])
      expect(trainingEndDateFromJst(value)).toBeNull();
  });
  it('requires server preview/revision plus explicit confirmation, resets changed inputs and retries same ID', () => {
    const source = readFileSync(
      new URL('../app/s/[serviceSlug]/manage/training/training-end-date-card.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('CONFIRM_TRAINING_END_DATE');
    expect(source).toContain('revision: preview?.revision');
    expect(source).toContain('operationId ?? crypto.randomUUID()');
    expect(source).toContain('setDate(e.target.value);');
    expect(source).toContain('setReason(e.target.value);');
    expect(source).toContain('setConfirmed(false)');
    expect(source).toContain('response.status === 409');
    expect(source).not.toMatch(/console\.|localStorage/);
    const route = readFileSync(
      new URL(
        '../app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/end-date/route.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(route).toContain('trainingEndDateResponse(request, serviceSlug, programEnrollmentId)');
    expect(route).not.toContain('function GET');
  });
});
