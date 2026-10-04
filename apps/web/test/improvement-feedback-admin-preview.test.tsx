import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BuildImprovementFeedbackReviewEvidence,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION as definition,
  projectImprovementFeedbackObservation,
} from '@bunshin/application';
import {
  feedbackPreviewWindow,
  projectFeedbackAdminPreview,
  type FeedbackPreviewWindow,
} from '../src/services/improvement-feedback-admin-preview';
import { FeedbackAdminSummary } from '../app/s/[serviceSlug]/manage/improvement-feedback/feedback-admin-summary';
import { safeLineAuthReturnPath, serviceAuthReturnSlug } from '../src/auth/line-return';
const now = new Date('2026-10-03T01:30:00Z');
const scope = {
  tenantRef: 'workspace',
  workspaceId: 'workspace',
  serviceId: 'service',
  packageKey: 'SOCIAL',
  adapterKey: definition.key,
  environment: 'DEVELOPMENT' as const,
};
function window(): FeedbackPreviewWindow {
  const value = feedbackPreviewWindow({}, now);
  if (value.outcome !== 'WINDOW') throw new Error('synthetic window');
  return value;
}
async function evidence(people: number, partial = false, extraSmall = false) {
  const rows = Array.from({ length: people }, (_, index) =>
    projectImprovementFeedbackObservation(scope, {
      id: `PRIVATE_RECEIPT_${index}`,
      actorUserId: `PRIVATE_USER_${index}`,
      bunshinId: `PRIVATE_BUNSHIN_${index}`,
      createdAt: new Date('2026-09-23Z'),
      category: 'OPERATION',
      surface: 'TODAY',
      impact: 'BLOCKED',
    }),
  );
  if (extraSmall)
    rows.push(
      projectImprovementFeedbackObservation(scope, {
        id: 'PRIVATE_SMALL',
        actorUserId: 'PRIVATE_USER_SMALL',
        bunshinId: 'PRIVATE_BUNSHIN_SMALL',
        createdAt: new Date('2026-09-23Z'),
        category: 'CONTENT',
        surface: 'PHOTO',
        impact: 'DIFFICULT',
      }),
    );
  const readWindow = window();
  return new BuildImprovementFeedbackReviewEvidence(
    { authorize: () => Promise.resolve(true) },
    {
      definition,
      readObservations: () =>
        Promise.resolve({
          observations: rows,
          coverage: {
            completeness: partial ? 'PARTIAL' : 'COMPLETE',
            missingCount: partial ? null : 0,
            truncated: partial,
          },
        }),
    },
  ).execute({
    scope,
    actorUserId: 'manager',
    subject: null,
    limit: 1000,
    fromInclusive: readWindow.fromInclusive,
    toExclusive: readWindow.toExclusive,
  });
}
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external communication forbidden');
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
describe('fixed complete-week feedback preview', () => {
  it('preserves only the scoped bare management destination through login', () => {
    const path = '/s/synthetic/manage/improvement-feedback';
    expect(safeLineAuthReturnPath(path)).toBe(path);
    expect(serviceAuthReturnSlug(path)).toBe('synthetic');
    for (const unsafe of [
      `${path}?week=2026-09-21`,
      `${path}?userId=other`,
      `${path}/other`,
      'https://external.invalid' + path,
      '/s/synthetic/manage/../improvement-feedback',
    ])
      expect(safeLineAuthReturnPath(unsafe)).toBeNull();
  });
  it('uses a complete Monday-Sunday JST window with twelve disjoint choices', () => {
    const value = window();
    expect(value.week).toBe('2026-09-21');
    expect(value.endDate).toBe('2026-09-27');
    expect(value.fromInclusive.toISOString()).toBe('2026-09-20T15:00:00.000Z');
    expect(value.toExclusive.toISOString()).toBe('2026-09-27T15:00:00.000Z');
    expect(value.weeks).toHaveLength(12);
    expect(new Set(value.weeks).size).toBe(12);
    expect(feedbackPreviewWindow({ week: value.weeks[11]! }, now).outcome).toBe('WINDOW');
    for (let index = 1; index < value.weeks.length; index++)
      expect(Date.parse(value.weeks[index - 1]!) - Date.parse(value.weeks[index]!)).toBe(
        7 * 86_400_000,
      );
  });
  it('only makes the finishing week selectable at Monday midnight JST', () => {
    expect(feedbackPreviewWindow({}, new Date('2026-10-04T14:59:59Z'))).toMatchObject({
      week: '2026-09-21',
    });
    expect(feedbackPreviewWindow({}, new Date('2026-10-04T15:00:00Z'))).toMatchObject({
      week: '2026-09-28',
    });
  });
  it.each([
    '2026-09-22',
    '2026-09-28',
    '2026-10-05',
    '2026-01-01',
    '2026-02-30',
    '',
    'private-input',
  ])('rejects invalid, ongoing or old week %s', (week) =>
    expect(feedbackPreviewWindow({ week }, now).outcome).toBe('INVALID_WINDOW'),
  );
  it.each([
    'userRef',
    'bunshinRef',
    'workspaceId',
    'serviceId',
    'packageKey',
    'limit',
    'from',
    'to',
    'environment',
  ])('rejects arbitrary %s filtering', (key) =>
    expect(feedbackPreviewWindow({ [key]: 'private-input' }, now).outcome).toBe('INVALID_WINDOW'),
  );
  it('rejects repeated week parameters', () =>
    expect(feedbackPreviewWindow({ week: ['2026-09-21', '2026-09-14'] }, now).outcome).toBe(
      'INVALID_WINDOW',
    ));
});
describe('server-side small-cell and reference disclosure boundary', () => {
  it('shows only allowlisted complete aggregate counts for five or more reporters', async () => {
    const original = await evidence(5);
    const model = projectFeedbackAdminPreview(original, window());
    expect(model).toMatchObject({
      state: 'VISIBLE',
      totals: { reports: 5, reporters: 5 },
      buckets: [
        {
          category: '操作',
          surface: '今日の提案',
          reports: 5,
          reporters: 5,
          decision: '人の確認が必要',
        },
      ],
    });
    expect(JSON.stringify(model)).not.toContain('PRIVATE_');
    expect(JSON.stringify(model)).not.toContain(original.evidenceRevision);
    expect(JSON.stringify(model)).not.toContain(original.buckets[0]!.clusterRef);
    expect(model).not.toHaveProperty('scope');
    const html = renderToStaticMarkup(<FeedbackAdminSummary preview={model} />);
    expect(html).toContain('保存報告 5件');
    expect(html).toContain('未測定');
    expect(html).not.toContain('PRIVATE_');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([1, 2, 3, 4])('suppresses every detail and total for %i reporters', async (people) => {
    const model = projectFeedbackAdminPreview(await evidence(people), window());
    expect(model).toMatchObject({ state: 'SUPPRESSED', buckets: [], totals: null });
    const html = renderToStaticMarkup(<FeedbackAdminSummary preview={model} />);
    expect(html).toContain('少人数の集計');
    expect(html).not.toContain('保存報告 ' + people + '件');
    expect(html).not.toContain('操作・');
    expect(html).not.toContain('PRIVATE_');
  });
  it('hides large buckets too when one small bucket could be inferred from totals', async () => {
    const model = projectFeedbackAdminPreview(await evidence(6, false, true), window());
    expect(model).toMatchObject({ state: 'SUPPRESSED', buckets: [], totals: null });
    expect(JSON.stringify(model)).not.toContain('reports');
    expect(JSON.stringify(model)).not.toContain('操作');
  });
  it('holds all partial counts even when every observed bucket is large', async () => {
    const model = projectFeedbackAdminPreview(await evidence(5, true), window());
    expect(model).toMatchObject({ state: 'INCOMPLETE', buckets: [], totals: null });
    const html = renderToStaticMarkup(<FeedbackAdminSummary preview={model} />);
    expect(html).toContain('0件とは判定していません');
    expect(html).not.toContain('保存報告 5件');
  });
  it('does not turn an unknown empty cohort into a healthy zero', async () => {
    const original = await evidence(0);
    expect(projectFeedbackAdminPreview(original, window()).state).toBe('EMPTY');
    const model = projectFeedbackAdminPreview(
      { ...original, coverage: { completeness: 'UNKNOWN', missingCount: null, truncated: false } },
      window(),
    );
    expect(model.state).toBe('INCOMPLETE');
  });
  it('rejects incompatible period, version and invalid counts', async () => {
    const original = await evidence(5);
    for (const invalid of [
      { ...original, period: { ...original.period, fromInclusive: 'different' } },
      { ...original, adapterVersion: 'future-v2' },
      { ...original, rule: { ...original.rule, version: 'future-v2' } },
      { ...original, reports: NaN },
      { ...original, buckets: [] },
    ])
      // Deliberately malformed runtime data must bypass the pinned compile-time rule literal.
      expect(() =>
        projectFeedbackAdminPreview(invalid as unknown as typeof original, window()),
      ).toThrow();
  });
});
