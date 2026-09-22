const sourceLabels: Record<string, string> = {
  ONBOARDING_RESPONSE: '初期設定・本人回答',
  BUSINESS_PROFILE: '事業プロフィール',
  BUNSHIN_PROFILE: '投稿パートナー設定',
  USER_MEMORY: '本人が追加した情報',
  SOCIAL_PROFILE: 'SNSプロフィール',
  ACCOUNT_STRATEGY: '投稿戦略',
  WEEKLY_PLAN: '週間計画',
  RECENT_MISSIONS: '過去の投稿案',
  RECENT_ACTIVITY: '最近の操作',
  RECENT_VARIANT: '選んだ別案',
  FEEDBACK_HISTORY: '投稿後の評価・不採用理由',
  DECISION: '採用・不採用',
  POST_PERFORMANCE: '投稿結果',
  GROUP_KNOWLEDGE: '公式情報',
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const references = (value: unknown) =>
  Array.isArray(value) ? value.filter((item) => typeof record(item).id === 'string').length : 0;

export function personalizationAuditSummary(payload: unknown) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return {
      mode: 'UNKNOWN' as const,
      sourceLabels: [],
      qualityVerdict: 'UNKNOWN' as const,
      issueCodes: [],
      referenceCounts: {
        memories: 0,
        groupKnowledge: 0,
        pastMissions: 0,
        activities: 0,
        variants: 0,
        feedback: 0,
        decisions: 0,
        performance: 0,
      },
    };
  }
  const root = record(payload);
  const personalization = record(root.personalization);
  const quality = record(root.quality);
  const sourceTypes = Array.isArray(personalization.sourceTypes)
    ? personalization.sourceTypes.filter((value): value is string => typeof value === 'string')
    : [];
  const mode = personalization.mode === 'FALLBACK' ? 'FALLBACK' : 'AI';
  return {
    mode,
    sourceLabels: sourceTypes.map((source) => sourceLabels[source] ?? source),
    qualityVerdict:
      quality.verdict === 'WARNING' || quality.verdict === 'BLOCKED' ? quality.verdict : 'PASS',
    issueCodes: Array.isArray(quality.issueCodes)
      ? quality.issueCodes.filter((value): value is string => typeof value === 'string')
      : [],
    referenceCounts: {
      memories: references(root.selectedMemories),
      groupKnowledge: references(root.groupKnowledge),
      pastMissions: references(personalization.recentMissions),
      activities: references(personalization.recentActivities),
      variants: references(personalization.recentVariants),
      feedback: references(personalization.recentFeedback),
      decisions: references(personalization.recentDecisions),
      performance:
        references(personalization.postRecords) + references(personalization.socialInsights),
    },
  };
}
