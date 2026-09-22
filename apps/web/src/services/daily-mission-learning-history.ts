import {
  POST_PERFORMANCE_METRIC_KEYS,
  postPerformanceLabels,
  readPostPerformance,
} from './post-performance';

type FeedbackRating = 'GOOD' | 'NEUTRAL' | 'BAD';
type RejectionReason =
  | 'NOT_MY_STYLE'
  | 'WRONG_TOPIC'
  | 'TOO_DIFFICULT'
  | 'TOO_MUCH_WORK'
  | 'SIMILAR_TO_PAST'
  | 'TOO_SALESY'
  | 'NOT_TODAY'
  | 'OTHER';

export type FallbackFeedbackPreference = 'STANDARD' | 'SOFT_CTA' | 'SIMPLE';

interface MissionReference {
  missionDate: Date;
  topic: string;
  angle: string;
}

export interface MissionLearningHistoryInput {
  activities: Array<{ type: string; occurredAt: Date; dailyMission: MissionReference }>;
  variants: Array<{
    selectedAt: Date;
    variant: { sequence: number };
    dailyMission: MissionReference;
  }>;
  feedback: Array<{ rating: FeedbackRating; updatedAt: Date; dailyMission: MissionReference }>;
  decisions: Array<{
    decision: 'ACCEPTED' | 'REJECTED';
    rejectionReason: RejectionReason | null;
    rejectionDetail: string | null;
    decidedAt: Date | null;
    dailyMission: MissionReference;
  }>;
  posts: Array<{ postedAt: Date; manualMetrics: unknown; dailyMission: MissionReference }>;
  socialInsights: Array<{
    observedOn: Date;
    followers: number | null;
    reach: number | null;
    impressions: number | null;
    profileViews: number | null;
    interactions: number | null;
  }>;
}

const feedbackLabels: Record<FeedbackRating, string> = {
  GOOD: '良かった',
  NEUTRAL: 'どちらでもない',
  BAD: '良くなかった',
};

const rejectionLabels: Record<RejectionReason, string> = {
  NOT_MY_STYLE: '自分らしくない',
  WRONG_TOPIC: '話題が合わない',
  TOO_DIFFICULT: '難しすぎる',
  TOO_MUCH_WORK: '作業量が多い',
  SIMILAR_TO_PAST: '過去内容と似ている',
  TOO_SALESY: '売り込みが強い',
  NOT_TODAY: '今日は扱わない',
  OTHER: 'その他',
};

const day = (value: Date) => value.toISOString().slice(0, 10);
const clean = (value: string, max = 160) => value.replace(/\s+/g, ' ').trim().slice(0, max);
const mission = (value: MissionReference) =>
  `${day(value.missionDate)}「${clean(value.topic, 100)}」(${clean(value.angle, 120)})`;

function feedbackSummary(input: MissionLearningHistoryInput) {
  const recentFeedback = input.feedback.slice(0, 12);
  const recentRejections = input.decisions
    .filter(
      (item): item is typeof item & { rejectionReason: RejectionReason } =>
        item.decision === 'REJECTED' && item.rejectionReason !== null,
    )
    .slice(0, 12);
  if (recentFeedback.length === 0 && recentRejections.length === 0) return '';
  const rejectionCounts = new Map<RejectionReason, number>();
  for (const item of recentRejections)
    rejectionCounts.set(item.rejectionReason, (rejectionCounts.get(item.rejectionReason) ?? 0) + 1);
  const topicRatings = new Map<string, { good: number; bad: number }>();
  for (const item of recentFeedback) {
    const topic = clean(item.dailyMission.topic, 100);
    const counts = topicRatings.get(topic) ?? { good: 0, bad: 0 };
    if (item.rating === 'GOOD') counts.good += 1;
    if (item.rating === 'BAD') counts.bad += 1;
    topicRatings.set(topic, counts);
  }
  const established = [
    ...[...rejectionCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([reason, count]) => `${rejectionLabels[reason]}が${count}回`),
    ...[...topicRatings.entries()].flatMap(([topic, counts]) => [
      ...(counts.good >= 2 ? [`「${topic}」系が良かった${counts.good}回`] : []),
      ...(counts.bad >= 2 ? [`「${topic}」系が良くなかった${counts.bad}回`] : []),
    ]),
  ];
  const observations = [
    ...recentFeedback
      .slice(0, 6)
      .map((item) => `${mission(item.dailyMission)}: ${feedbackLabels[item.rating]}`),
    ...recentRejections.slice(0, 6).map((item) => {
      const detail = item.rejectionDetail ? `（${clean(item.rejectionDetail)}）` : '';
      return `${mission(item.dailyMission)}: 不採用=${rejectionLabels[item.rejectionReason]}${detail}`;
    }),
  ];
  return [
    established.length ? `複数回から確認できた傾向:\n${established.join('\n')}` : null,
    `個別の記録（1件だけでは傾向と断定しない）:\n${observations.join('\n')}`,
    '反映方針: 複数回確認できた傾向を優先する。1件だけの評価は参考情報として扱う。同じ原稿や単なる言い換えは再利用しない。良かった読者価値は、別の疑問・場面・具体例へ展開する。低評価や不採用の理由は繰り返さない。',
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');
}

function behaviorSummary(input: MissionLearningHistoryInput) {
  const activities = input.activities
    .slice(0, 8)
    .map((item) => `${day(item.occurredAt)} ${item.type}: ${clean(item.dailyMission.topic, 100)}`);
  const variants = input.variants
    .slice(0, 5)
    .map(
      (item) =>
        `${day(item.selectedAt)} 別案${item.variant.sequence}を選択: ${clean(item.dailyMission.topic, 100)}`,
    );
  return [
    activities.length ? `直近の操作:\n${activities.join('\n')}` : null,
    variants.length ? `本人が選んだ別案:\n${variants.join('\n')}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');
}

function performanceSummary(input: MissionLearningHistoryInput) {
  const posts = input.posts
    .map((post) => ({ post, performance: readPostPerformance(post.manualMetrics) }))
    .filter(
      (item): item is typeof item & { performance: NonNullable<typeof item.performance> } =>
        item.performance !== null,
    )
    .slice(0, 5)
    .map(({ post, performance }) => {
      const metrics = POST_PERFORMANCE_METRIC_KEYS.map((key) =>
        performance[key] === null ? null : `${postPerformanceLabels[key]}${performance[key]}`,
      ).filter((value): value is string => Boolean(value));
      return `${mission(post.dailyMission)}: ${metrics.join('、')}`;
    });
  const latest = input.socialInsights[0];
  const previous = input.socialInsights[1];
  const insight = latest
    ? [
        `SNS全体 ${day(latest.observedOn)}: ${[
          latest.followers === null ? null : `フォロワー${latest.followers}`,
          latest.reach === null ? null : `リーチ${latest.reach}`,
          latest.impressions === null ? null : `表示${latest.impressions}`,
          latest.profileViews === null ? null : `プロフィール閲覧${latest.profileViews}`,
          latest.interactions === null ? null : `反応${latest.interactions}`,
        ]
          .filter(Boolean)
          .join('、')}`,
        previous && latest.followers !== null && previous.followers !== null
          ? `前回記録からのフォロワー差: ${latest.followers - previous.followers}`
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n')
    : null;
  if (posts.length === 0 && !insight) return '';
  return [
    posts.length ? `投稿別の反応:\n${posts.join('\n')}` : null,
    insight,
    posts.length
      ? '反映方針: 数字が良い投稿の読者価値や利用場面を残し、別の疑問・具体例で検証する。一件だけで効果を断定しない。'
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');
}

export function summarizeMissionLearningHistory(input: MissionLearningHistoryInput) {
  const rejectionCounts = input.decisions
    .filter(
      (item): item is typeof item & { rejectionReason: RejectionReason } =>
        item.decision === 'REJECTED' && item.rejectionReason !== null,
    )
    .slice(0, 12)
    .reduce((counts, item) => {
      counts.set(item.rejectionReason, (counts.get(item.rejectionReason) ?? 0) + 1);
      return counts;
    }, new Map<RejectionReason, number>());
  const fallbackPreference: FallbackFeedbackPreference =
    (rejectionCounts.get('TOO_SALESY') ?? 0) >= 2
      ? 'SOFT_CTA'
      : (rejectionCounts.get('TOO_DIFFICULT') ?? 0) + (rejectionCounts.get('TOO_MUCH_WORK') ?? 0) >=
          2
        ? 'SIMPLE'
        : 'STANDARD';
  return {
    feedbackSummary: feedbackSummary(input),
    behaviorSummary: behaviorSummary(input),
    performanceSummary: performanceSummary(input),
    fallbackPreference,
  };
}
