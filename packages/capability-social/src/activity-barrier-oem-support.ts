import type { SocialActivityBarrierCategory } from './activity-barrier';

export const SOCIAL_ACTIVITY_OEM_SUPPORT_RULE_VERSION = 'social-activity-oem-support-v1' as const;
export const SOCIAL_ACTIVITY_OEM_SUPPORT_MINIMUM_ELIGIBLE_DAYS = 14;

const recommendations = {
  MEDIA: {
    key: 'MEDIA_PRODUCTION_SUPPORT',
    title: '画像・動画制作支援',
    description: '投稿に必要な画像や動画を準備する支援を検討します。',
  },
  TIME: {
    key: 'SNS_OPERATION_SUPPORT',
    title: 'SNS運用支援',
    description: '日々の投稿作業の負担を減らす支援を検討します。',
  },
  EFFORT: {
    key: 'SNS_OPERATION_SUPPORT',
    title: 'SNS運用支援',
    description: '日々の投稿作業の負担を減らす支援を検討します。',
  },
  EFFECT: {
    key: 'SNS_ANALYSIS_SUPPORT',
    title: 'SNS分析・運用改善支援',
    description: '投稿結果を整理し、次の改善につなげる支援を検討します。',
  },
  RESPONSE: {
    key: 'RESPONSE_OPERATION_SUPPORT',
    title: '反応対応・LINE支援',
    description: 'コメントや問い合わせへの対応を整える支援を検討します。',
  },
  LEAD: {
    key: 'CONVERSION_PATH_SUPPORT',
    title: 'LINE・LP・導線改善支援',
    description: '反応を予約や購入へつなげる導線の支援を検討します。',
  },
} as const;

type EligibleCategory = keyof typeof recommendations;

export type SocialActivityOemSupportRecommendation = {
  key: (typeof recommendations)[EligibleCategory]['key'];
  title: string;
  description: string;
  reasonCode: 'CONFIRMED_BARRIER_PERSISTED_AFTER_FREE_SUPPORT';
  ruleVersion: typeof SOCIAL_ACTIVITY_OEM_SUPPORT_RULE_VERSION;
};

export function selectSocialActivityOemSupportRecommendation(input: {
  category: SocialActivityBarrierCategory;
  supportCompletedAt: Date;
  observationFrom: Date;
  observationTo: Date;
  eligibleDays: number;
  excludedSystemIncidentDays: number;
}): SocialActivityOemSupportRecommendation | null {
  const recommendation = recommendations[input.category as EligibleCategory];
  if (
    !recommendation ||
    input.observationFrom < input.supportCompletedAt ||
    input.observationTo <= input.observationFrom ||
    input.eligibleDays < SOCIAL_ACTIVITY_OEM_SUPPORT_MINIMUM_ELIGIBLE_DAYS ||
    input.excludedSystemIncidentDays > 0
  )
    return null;

  return {
    ...recommendation,
    reasonCode: 'CONFIRMED_BARRIER_PERSISTED_AFTER_FREE_SUPPORT',
    ruleVersion: SOCIAL_ACTIVITY_OEM_SUPPORT_RULE_VERSION,
  };
}
