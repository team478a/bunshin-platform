import type { BuildImprovementFeedbackReviewEvidence } from '@bunshin/application';

export const FEEDBACK_PREVIEW_POLICY = Object.freeze({
  version: 'feedback-admin-preview-v1',
  minimumBucketReporters: 5,
  weeks: 12,
  limit: 1000,
});
const DAY = 86_400_000;
const JST = 9 * 3_600_000;
const ymd = (value: number) => new Date(value).toISOString().slice(0, 10);
export type FeedbackPreviewQuery = Record<string, string | string[] | undefined>;
export function feedbackPreviewWindow(query: FeedbackPreviewQuery, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error('invalid preview clock');
  const local = new Date(now.getTime() + JST);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const thisMonday = today - ((local.getUTCDay() + 6) % 7) * DAY;
  const lastMonday = thisMonday - 7 * DAY;
  const weeks = Array.from({ length: FEEDBACK_PREVIEW_POLICY.weeks }, (_, index) =>
    ymd(lastMonday - index * 7 * DAY),
  );
  const keys = Object.keys(query).filter((key) => query[key] !== undefined);
  const requested = query['week'];
  if (
    keys.some((key) => key !== 'week') ||
    (requested !== undefined && (typeof requested !== 'string' || !weeks.includes(requested)))
  )
    return { outcome: 'INVALID_WINDOW' as const, weeks };
  const week = requested ?? weeks[0]!;
  const start = Date.parse(`${week}T00:00:00.000Z`);
  return {
    outcome: 'WINDOW' as const,
    week,
    weeks,
    endDate: ymd(start + 6 * DAY),
    fromInclusive: new Date(start - JST),
    toExclusive: new Date(start + 7 * DAY - JST),
  };
}
export type FeedbackPreviewWindow = Extract<
  ReturnType<typeof feedbackPreviewWindow>,
  { outcome: 'WINDOW' }
>;
type Evidence = Awaited<ReturnType<BuildImprovementFeedbackReviewEvidence['execute']>>;
const categories: Record<string, string> = {
  OPERATION: '操作',
  CONTENT: '投稿案の内容',
  WAITING: '待ち時間',
  OTHER: 'その他',
};
const surfaces: Record<string, string> = {
  SETUP: '初期設定',
  TODAY: '今日の提案',
  PHOTO: '写真',
  VIDEO: '動画',
  NOTIFICATION: '通知',
  OTHER: 'その他',
};
const impacts: Record<string, string> = {
  BLOCKED: '進められない',
  DIFFICULT: '使いにくい',
  SUGGESTION: '改善の提案',
};

/** Server-side disclosure boundary. Never pass the raw evidence into a rendered/client model. */
export function projectFeedbackAdminPreview(evidence: Evidence, window: FeedbackPreviewWindow) {
  if (
    evidence.period.fromInclusive !== window.fromInclusive.toISOString() ||
    evidence.period.toExclusive !== window.toExclusive.toISOString()
  )
    throw new Error('feedback preview period mismatch');
  if (
    evidence.adapterVersion !== 'trouble-feedback-v1' ||
    evidence.rule.version !== 'selected-feedback-review-v1' ||
    !Number.isSafeInteger(evidence.reports) ||
    evidence.reports < 0 ||
    evidence.reports > FEEDBACK_PREVIEW_POLICY.limit ||
    !Number.isSafeInteger(evidence.distinctReporters) ||
    evidence.distinctReporters < 0 ||
    evidence.distinctReporters > evidence.reports ||
    evidence.buckets.reduce((sum, bucket) => sum + bucket.reports, 0) !== evidence.reports ||
    evidence.buckets.some(
      (bucket) =>
        !Number.isSafeInteger(bucket.reports) ||
        bucket.reports < 1 ||
        !Number.isSafeInteger(bucket.distinctReporters) ||
        bucket.distinctReporters < 1 ||
        bucket.distinctReporters > bucket.reports,
    )
  )
    throw new Error('invalid feedback preview evidence');
  const base = {
    policyVersion: FEEDBACK_PREVIEW_POLICY.version,
    ruleVersion: 'selected-feedback-review-v1',
    week: window.week,
    endDate: window.endDate,
    completeness: evidence.coverage.completeness,
  };
  if (evidence.coverage.completeness !== 'COMPLETE')
    return { ...base, state: 'INCOMPLETE' as const, buckets: [], totals: null };
  if (evidence.reports === 0)
    return { ...base, state: 'EMPTY' as const, buckets: [], totals: null };
  if (
    evidence.buckets.some(
      (bucket) => bucket.distinctReporters < FEEDBACK_PREVIEW_POLICY.minimumBucketReporters,
    )
  )
    return { ...base, state: 'SUPPRESSED' as const, buckets: [], totals: null };
  return {
    ...base,
    state: 'VISIBLE' as const,
    totals: { reports: evidence.reports, reporters: evidence.distinctReporters },
    buckets: evidence.buckets.map((bucket) => ({
      category: categories[bucket.labels.category] ?? '未分類',
      surface: surfaces[bucket.labels.surface] ?? '未分類',
      impact: impacts[bucket.labels.impact] ?? '未分類',
      reports: bucket.reports,
      reporters: bucket.distinctReporters,
      decision: bucket.reviewDecision === 'REVIEW_REQUIRED' ? '人の確認が必要' : '判定保留',
      reviewHandle: null as string | null,
    })),
  };
}
export type FeedbackAdminPreview = ReturnType<typeof projectFeedbackAdminPreview>;
