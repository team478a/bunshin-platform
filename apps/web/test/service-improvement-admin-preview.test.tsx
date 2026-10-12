import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { feedbackPreviewWindow } from '../src/services/improvement-feedback-admin-preview';
import {
  overviewPreviewWindow,
  projectOverviewPreview,
} from '../src/services/service-improvement-admin-preview';
import { OverviewSummary } from '../app/s/[serviceSlug]/manage/improvement-overview/card';
import { fixtureOverview, overviewClock } from './service-improvement-overview-fixture';
const window = feedbackPreviewWindow({}, overviewClock);
if (window.outcome !== 'WINDOW') throw new Error('fixture');
describe('restricted overview disclosure projection', () => {
  it.each([
    [9, '5〜9'],
    [10, '10〜19'],
    [19, '10〜19'],
    [20, '20〜49'],
    [1000, '500〜1000'],
  ] as const)(
    'bands %s recorded rows without disclosing an exact upper-bound count',
    async (count, value) => {
      expect(
        projectOverviewPreview(await fixtureOverview('TRAINING', count), window, 'TRAINING')
          .sections[0]?.records,
      ).toBe(value);
    },
  );
  it.each(['SOCIAL', 'TRAINING'] as const)(
    'uses real %s source definitions and bands, never raw IDs or exact counts',
    async (kind) => {
      const result = projectOverviewPreview(await fixtureOverview(kind), window, kind);
      expect(result.sections.every((s) => s.records === '5〜9' && s.subjects === '5〜9')).toBe(
        true,
      );
      const json = JSON.stringify(result);
      expect(json).not.toContain('PRIVATE_');
      expect(json).not.toContain('distinctSubjects');
      const html = renderToStaticMarkup(<OverviewSummary preview={result} />);
      expect(html).toContain('5〜9');
      expect(html).not.toContain('成功率');
      expect(html).not.toContain('合格');
      if (kind === 'SOCIAL')
        expect(result.sections[0]?.metrics).toEqual([
          { label: '投稿案の採用', value: '5〜9' },
          { label: '投稿案の不採用', value: '該当記録なし' },
          { label: '本人による投稿記録', value: '該当記録なし' },
        ]);
    },
  );
  it.each([0, 1, 4])('does not turn %s-person suppression into zero or success', async (count) => {
    const result = projectOverviewPreview(await fixtureOverview('SOCIAL', count), window, 'SOCIAL');
    expect(result.sections.every((s) => s.state === 'WITHHELD' && s.records === '非表示')).toBe(
      true,
    );
    const html = renderToStaticMarkup(<OverviewSummary preview={result} />);
    expect(html).toContain('0件と区別しません');
    expect(html).not.toContain('保存済み記録の件数範囲');
  });
  it('keeps partial reads withheld', async () => {
    const result = projectOverviewPreview(
      await fixtureOverview('SOCIAL', 10, 'PARTIAL'),
      window,
      'SOCIAL',
    );
    expect(result.sections[0]?.reasons).toContain('読取が不完全なため未判定');
  });
  it('rejects wrong period/package/version and a fabricated environment or rate', async () => {
    const original = await fixtureOverview();
    expect(() =>
      projectOverviewPreview(
        { ...original, period: { ...original.period, fromInclusive: 'other' } },
        window,
        'SOCIAL',
      ),
    ).toThrow();
    expect(() => projectOverviewPreview(original, window, 'TRAINING')).toThrow();
    for (const change of [
      { sourceVersion: 'unknown' },
      { releaseSha: 'a'.repeat(40) },
      { metrics: [] },
      { holdReasons: ['unknown'] },
    ]) {
      expect(() =>
        projectOverviewPreview(
          {
            ...original,
            sections: [{ ...original.sections[0]!, ...change }, ...original.sections.slice(1)],
          } as unknown as typeof original,
          window,
          'SOCIAL',
        ),
      ).toThrow();
    }
  });
  it('rejects small visible counts and withheld counts accidentally populated', async () => {
    const original = await fixtureOverview();
    original.sections[0]!.distinctSubjects = 4;
    expect(() => projectOverviewPreview(original, window, 'SOCIAL')).toThrow();
    const held = await fixtureOverview('SOCIAL', 4);
    held.sections[0]!.observedRecords = 4;
    expect(() => projectOverviewPreview(held, window, 'SOCIAL')).toThrow();
  });
  it('allows only completed fixed JST weeks and an explicit supported kind', () => {
    expect(overviewPreviewWindow({ kind: 'TRAINING' }, overviewClock)).toMatchObject({
      outcome: 'WINDOW',
      week: '2026-10-05',
      packageKey: 'TRAINING',
    });
    for (const query of [
      {},
      { kind: 'OTHER' },
      { kind: ['SOCIAL', 'TRAINING'] },
      { kind: 'SOCIAL', week: '2026-10-12' },
      { kind: 'SOCIAL', userId: 'private' },
      { kind: 'SOCIAL', from: 'private' },
    ])
      expect(overviewPreviewWindow(query, overviewClock).outcome).toBe('INVALID_WINDOW');
  });
});
