import type {
  MissionBusinessProfileContext,
  MissionPersonalizationContext,
  MissionPersonalizationSignal,
  SocialAccountStrategy,
  SocialProfile,
} from '@bunshin/capability-social';
import type { SelectedBunshinMemory } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

const signal = (
  type: MissionPersonalizationSignal['type'],
  label: string,
  values: Array<string | null | undefined>,
): MissionPersonalizationSignal | null => {
  const value = values
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .join('\n');
  return value ? { type, label, value: value.slice(0, 3_000) } : null;
};

export function buildMissionPersonalizationContext(input: {
  bunshin: {
    objectiveSummary: string;
    audienceSummary: string;
    personalitySummary: string;
  };
  socialProfile: SocialProfile;
  strategy: SocialAccountStrategy;
  businessProfile?: MissionBusinessProfileContext | null;
  onboardingContext?: string | null;
  behaviorSummary?: string | null;
  feedbackSummary?: string | null;
  performanceSummary?: string | null;
  selectedMemories?: SelectedBunshinMemory[];
}): MissionPersonalizationContext {
  const signals = [
    signal('BUNSHIN_PROFILE', '本人のBunshin設定', [
      `目的: ${input.bunshin.objectiveSummary}`,
      `届けたい相手: ${input.bunshin.audienceSummary}`,
      `発信らしさ: ${input.bunshin.personalitySummary}`,
    ]),
    signal('SOCIAL_PROFILE', '本人のSNS設定', [
      `利用SNS: ${input.socialProfile.platform}`,
      `SNSの目的: ${input.socialProfile.purpose}`,
      `希望形式: ${input.socialProfile.preferredFormats.join('、')}`,
    ]),
    signal('ACCOUNT_STRATEGY', '本人の承認済み投稿戦略', [
      `目標: ${input.strategy.goal}`,
      `コンセプト: ${input.strategy.concept}`,
      `立ち位置: ${input.strategy.positioning}`,
      `対象: ${input.strategy.targetSummary}`,
      `投稿方針: ${input.strategy.postingPolicy}`,
    ]),
    input.businessProfile
      ? signal('BUSINESS_PROFILE', '本人の事業プロフィール', [
          `業種: ${input.businessProfile.industry}`,
          `商品・サービス: ${input.businessProfile.productService}`,
          `目的: ${input.businessProfile.primaryPurpose}`,
          `対象: ${input.businessProfile.targetAudience}`,
          input.businessProfile.businessFeatures,
        ])
      : null,
    signal('ONBOARDING_RESPONSE', '本人の初期設定回答', [input.onboardingContext]),
    signal('RECENT_ACTIVITY', '本人の最近の選択・利用履歴', [input.behaviorSummary]),
    signal('FEEDBACK_HISTORY', '本人の評価・不採用理由', [input.feedbackSummary]),
    signal('POST_PERFORMANCE', '本人の投稿実績・反応履歴', [input.performanceSummary]),
    signal(
      'USER_MEMORY',
      '本人が追加した情報・Daily Action',
      (input.selectedMemories ?? []).map(
        ({ summary, selectionReason }) => `${summary}\n選定理由: ${selectionReason}`,
      ),
    ),
  ].filter((value): value is MissionPersonalizationSignal => value !== null);

  const required = new Set(['BUNSHIN_PROFILE', 'SOCIAL_PROFILE', 'ACCOUNT_STRATEGY']);
  if (!signals.some(({ type }) => required.has(type)))
    throw new ApplicationError('CONTENT_REJECTED', 'personalization context is unavailable');

  return {
    signals,
    instruction:
      '共通の商品情報だけで企画を決めず、この本人固有signalを少なくとも一つ、topic・angle・具体例・訴求ポイントのいずれかへ意味が分かる形で反映する。FEEDBACK_HISTORYとPOST_PERFORMANCEがある場合は、低評価・不採用理由を避け、反応が良かった読者価値を別の疑問・場面・具体例へ発展させる。過去投稿の再利用や単なる言い換えはしない。ランダム化、語尾、絵文字だけで個人差を作らない。根拠にない体験や実績は追加しない。',
  };
}

export function personalizationSourceTypes(context: MissionPersonalizationContext): string[] {
  return [...new Set(context.signals.map(({ type }) => type))];
}
