export const POST_PERFORMANCE_METRIC_KEYS = [
  'reach',
  'impressions',
  'likes',
  'comments',
  'saves',
  'shares',
  'profileViews',
  'follows',
] as const;

export type PostPerformanceMetricKey = (typeof POST_PERFORMANCE_METRIC_KEYS)[number];
export type PostPerformanceMetrics = Record<PostPerformanceMetricKey, number | null>;

export type PostPerformanceView = PostPerformanceMetrics & {
  dailyMissionId: string;
  topic: string;
  postedAt: string;
  observedOn: string;
  source: 'SCREENSHOT' | 'MANUAL';
};

export const postPerformanceLabels: Record<PostPerformanceMetricKey, string> = {
  reach: 'リーチ',
  impressions: '表示回数',
  likes: 'いいね',
  comments: 'コメント',
  saves: '保存',
  shares: 'シェア',
  profileViews: 'プロフィール閲覧',
  follows: 'フォロー増加',
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function jsonObject(value: unknown): { [key: string]: JsonValue } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item))
      result[key] = item as string | number | boolean | null;
    else if (Array.isArray(item))
      result[key] = item.filter(
        (entry): entry is string | number | boolean | null =>
          entry === null || ['string', 'number', 'boolean'].includes(typeof entry),
      );
    else if (typeof item === 'object') result[key] = jsonObject(item);
  }
  return result;
}

const metric = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export function readPostPerformance(value: unknown):
  | (PostPerformanceMetrics & {
      observedOn: string;
      source: 'SCREENSHOT' | 'MANUAL';
    })
  | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)['socialPerformance'];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
  const record = nested as Record<string, unknown>;
  const observedOn = typeof record['observedOn'] === 'string' ? record['observedOn'] : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) return null;
  const source = record['source'] === 'SCREENSHOT' ? 'SCREENSHOT' : 'MANUAL';
  const metrics = Object.fromEntries(
    POST_PERFORMANCE_METRIC_KEYS.map((key) => [key, metric(record[key])]),
  ) as PostPerformanceMetrics;
  if (POST_PERFORMANCE_METRIC_KEYS.every((key) => metrics[key] === null)) return null;
  return { ...metrics, observedOn, source };
}

export function writePostPerformance(
  current: unknown,
  performance: PostPerformanceMetrics & {
    observedOn: string;
    source: 'SCREENSHOT' | 'MANUAL';
  },
): { [key: string]: JsonValue } {
  return { ...jsonObject(current), socialPerformance: performance };
}

const value = (metricValue: number | null) => metricValue ?? 0;
const engagementScore = (item: PostPerformanceView) =>
  value(item.likes) +
  value(item.comments) * 2 +
  value(item.saves) * 3 +
  value(item.shares) * 3 +
  value(item.follows) * 2;

export function buildPostPerformanceInsight(items: PostPerformanceView[]) {
  const recorded = [...items].sort((a, b) => b.observedOn.localeCompare(a.observedOn));
  const best = [...recorded].sort(
    (a, b) => engagementScore(b) - engagementScore(a) || b.observedOn.localeCompare(a.observedOn),
  )[0];
  if (!best)
    return {
      recordedCount: 0,
      bestTopic: null,
      title: '投稿後の数字を記録しましょう',
      guidance: '投稿ごとの反応を残すと、次に試す内容を提案できるようになります。',
    };
  if (recorded.length < 3)
    return {
      recordedCount: recorded.length,
      bestTopic: best.topic,
      title: `あと${3 - recorded.length}件記録すると比較できます`,
      guidance: '少ない件数だけで良し悪しを決めず、まず3件分の反応を記録しましょう。',
    };
  if (value(best.saves) + value(best.shares) > 0)
    return {
      recordedCount: recorded.length,
      bestTopic: best.topic,
      title: '保存・共有された内容を別の切り口で使いましょう',
      guidance: '同じテーマを、最初の一言や写真を変えて次の投稿でも試します。',
    };
  if (value(best.profileViews) > 0 && value(best.follows) === 0)
    return {
      recordedCount: recorded.length,
      bestTopic: best.topic,
      title: 'プロフィールの説明を分かりやすくしましょう',
      guidance: '投稿からプロフィールは見られています。誰向けの発信かを冒頭で明確にします。',
    };
  return {
    recordedCount: recorded.length,
    bestTopic: best.topic,
    title: '反応が多かったテーマをもう一度試しましょう',
    guidance: '一度の数字で断定せず、同じテーマを別の表現で投稿して反応を比べます。',
  };
}

export function buildPostPerformancePlanningContext(items: PostPerformanceView[]) {
  const recorded = items.filter((item) => POST_PERFORMANCE_METRIC_KEYS.some((key) => item[key]));
  const ranked = [...recorded]
    .sort((a, b) => engagementScore(b) - engagementScore(a))
    .slice(0, 3)
    .map((item) => ({
      topic: item.topic,
      engagementScore: engagementScore(item),
      saves: value(item.saves),
      shares: value(item.shares),
      comments: value(item.comments),
      follows: value(item.follows),
    }));
  return { recordedCount: recorded.length, strongTopics: ranked };
}
