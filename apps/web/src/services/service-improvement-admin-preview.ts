import { z } from 'zod';
import type { BuildServiceImprovementOverview } from '@bunshin/application';
import {
  feedbackPreviewWindow,
  type FeedbackPreviewQuery,
  type FeedbackPreviewWindow,
} from './improvement-feedback-admin-preview';

export const OVERVIEW_PREVIEW_VERSION = 'service-overview-preview-v1';
export const OVERVIEW_READ_LIMIT = 1000;
export type OverviewPackage = 'SOCIAL' | 'TRAINING';
export function overviewPreviewWindow(query: FeedbackPreviewQuery, now: Date) {
  const { kind, ...period } = query;
  const window = feedbackPreviewWindow(period, now);
  if (kind !== 'SOCIAL' && kind !== 'TRAINING')
    return { outcome: 'INVALID_WINDOW' as const, weeks: window.weeks };
  return window.outcome === 'WINDOW' ? ({ ...window, packageKey: kind } as const) : window;
}
const bandValues = [
  '該当記録なし',
  '5〜9',
  '10〜19',
  '20〜49',
  '50〜99',
  '100〜199',
  '200〜499',
  '500〜1000',
  '非表示',
] as const;
export const overviewPreviewSchema = z
  .object({
    version: z.literal(OVERVIEW_PREVIEW_VERSION),
    week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    packageKey: z.enum(['SOCIAL', 'TRAINING']),
    sections: z
      .array(
        z
          .object({
            key: z.string().max(80),
            title: z.string().max(80),
            sourceVersion: z.string().max(80),
            state: z.enum(['VISIBLE', 'WITHHELD']),
            reasons: z.array(z.string().max(100)).max(3),
            records: z.enum(bandValues),
            subjects: z.enum(bandValues),
            metrics: z
              .array(z.object({ label: z.string().max(80), value: z.enum(bandValues) }).strict())
              .max(5),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type OverviewPreview = z.infer<typeof overviewPreviewSchema>;
type Overview = Awaited<ReturnType<BuildServiceImprovementOverview['execute']>>;
const specs: Record<
  OverviewPackage,
  { key: string; version: string; title: string; metrics: Record<string, string> }[]
> = {
  SOCIAL: [
    {
      key: 'SOCIAL_PROGRESS',
      version: 'social-progress-v1',
      title: '投稿案の採否と実投稿',
      metrics: {
        accepted: '投稿案の採用',
        rejected: '投稿案の不採用',
        posted: '本人による投稿記録',
      },
    },
    {
      key: 'TROUBLE_FEEDBACK',
      version: 'trouble-feedback-v1',
      title: 'SNSの困った報告',
      metrics: {},
    },
    {
      key: 'HASSY_SUPPORT_OUTCOMES',
      version: 'hassy-support-outcomes-v1',
      title: '継続支援の記録',
      metrics: {
        acceptedByCutoff: '支援案の採用',
        completedByCutoff: '支援の完了記録',
        skippedByCutoff: '支援のスキップ',
      },
    },
    {
      key: 'HASSY_PHOTO_QUALITY',
      version: 'hassy-photo-quality-v2',
      title: '写真品質の固定判定',
      metrics: { unconfirmedFact: '未確認の事実', hadIssues: '品質上の問題記録' },
    },
  ],
  TRAINING: [
    {
      key: 'TRAINING_PROGRESS',
      version: 'training-progress-v1',
      title: '研修課題と評価処理の記録',
      metrics: {
        started: '課題の開始',
        completed: '課題の完了記録',
        submitted: '回答の記録',
        evaluationReady: '評価処理の完了',
        evaluationFailed: '評価処理の失敗',
      },
    },
  ],
};
const reasons: Record<string, string> = {
  READ_INCOMPLETE: '読取が不完全なため未判定',
  SOURCE_UNCERTAIN: '記録や日時の証拠が不足しているため未判定',
  SMALL_SAMPLE: '少人数のため非表示（0件と区別しません）',
};
function invalid(): never {
  throw new Error('invalid overview preview evidence');
}
function validCount(n: number | null): n is number {
  return n !== null && Number.isSafeInteger(n) && n >= 0 && n <= OVERVIEW_READ_LIMIT;
}
function band(n: number | null) {
  if (n === null) return '非表示';
  if (!validCount(n) || (n > 0 && n < 5)) invalid();
  if (n === 0) return '該当記録なし';
  for (const [low, high] of [
    [5, 9],
    [10, 19],
    [20, 49],
    [50, 99],
    [100, 199],
    [200, 499],
    [500, 1000],
  ] as const)
    if (n >= low && n <= high) return `${low}〜${high}`;
  return invalid();
}
/** Disclosure projection: never serialize the internal overview into the HTTP/client model. */
export function projectOverviewPreview(
  overview: Overview,
  window: FeedbackPreviewWindow,
  packageKey: OverviewPackage,
): OverviewPreview {
  if (
    overview.version !== 'service-improvement-overview-v1' ||
    overview.snapshotConsistency !== 'PER_ADAPTER' ||
    overview.diagnosis !== 'NOT_PERFORMED' ||
    overview.executionPermission !== 'NOT_GRANTED' ||
    overview.period.fromInclusive !== window.fromInclusive.toISOString() ||
    overview.period.toExclusive !== window.toExclusive.toISOString() ||
    overview.sections.length !== specs[packageKey].length
  )
    invalid();
  const sections = overview.sections.map((s, index) => {
    const spec = specs[packageKey][index]!;
    const labels: Record<string, string> = spec.metrics;
    const metricKeys = Object.keys(labels);
    if (
      s.adapterKey !== spec.key ||
      s.packageKey !== packageKey ||
      s.sourceVersion !== spec.version ||
      s.populationCoverage !== 'UNKNOWN' ||
      s.sourceEnvironment !== 'UNKNOWN' ||
      s.releaseSha !== null ||
      s.cost !== null ||
      s.denominator.kind !== 'RECORDED_COHORT' ||
      s.metrics.length !== metricKeys.length ||
      s.metrics.some((m, i) => m.key !== metricKeys[i] || m.rate !== null) ||
      s.holdReasons.some((r) => !Object.hasOwn(reasons, r))
    )
      invalid();
    if (s.visibility === 'VISIBLE') {
      if (
        s.completeness !== 'COMPLETE' ||
        s.truncated ||
        s.holdReasons.length ||
        !validCount(s.observedRecords) ||
        !validCount(s.distinctSubjects) ||
        s.distinctSubjects < 5 ||
        s.distinctSubjects > s.observedRecords ||
        s.denominator.count !== s.observedRecords ||
        s.metrics.some((m) => !validCount(m.count) || m.count > s.observedRecords!)
      )
        invalid();
    } else if (
      s.visibility !== 'WITHHELD' ||
      !s.holdReasons.length ||
      s.observedRecords !== null ||
      s.distinctSubjects !== null ||
      s.denominator.count !== null ||
      s.metrics.some((m) => m.count !== null)
    )
      invalid();
    return {
      key: spec.key,
      title: spec.title,
      sourceVersion: spec.version,
      state: s.visibility,
      reasons: s.holdReasons.map((r) => reasons[r]!),
      records: band(s.observedRecords),
      subjects: band(s.distinctSubjects),
      metrics: s.metrics.map((m) => ({ label: labels[m.key]!, value: band(m.count) })),
    };
  });
  return overviewPreviewSchema.parse({
    version: OVERVIEW_PREVIEW_VERSION,
    week: window.week,
    endDate: window.endDate,
    packageKey,
    sections,
  });
}
