import type {
  DailyMissionBrief,
  DailyMissionPlannerInput,
  ContentPillar,
  MissionBusinessProfileContext,
  MissionPersonalizationContext,
  MissionPersonalizationSignal,
  SocialAccountStrategy,
  SocialProfile,
} from '@bunshin/capability-social';
import {
  SelectBunshinMemories,
  type BunshinMemoryRepository,
  type BunshinPersonalityVersion,
  type SelectedBunshinMemory,
} from '@bunshin/application';
import type { BunshinAggregate, BunshinMemory } from '@bunshin/platform-domain';
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

interface PersonalizationHistory {
  businessProfile: MissionBusinessProfileContext | null;
  onboardingContext: string | null;
  behaviorSummary: string | null;
  feedbackSummary: string | null;
  performanceSummary: string | null;
}

interface PromptKnowledge {
  type: string;
  title: string;
  content: string;
}

export function buildDailyMissionPersonalizationBase(input: {
  bunshin: Pick<
    BunshinAggregate,
    'name' | 'objectiveSummary' | 'audienceSummary' | 'personalitySummary'
  >;
  personality: BunshinPersonalityVersion | null;
  socialProfile: SocialProfile;
  strategy: SocialAccountStrategy;
  history: PersonalizationHistory;
  officialKnowledge: PromptKnowledge[] | null;
  grantedKnowledge: PromptKnowledge[];
  personalMaterials: PromptKnowledge[];
}): {
  bunshinContext: DailyMissionPlannerInput['bunshin'];
  strategyContext: Pick<
    SocialAccountStrategy,
    'concept' | 'positioning' | 'targetSummary' | 'ctaStrategy' | 'postingPolicy'
  >;
  plannerPersonalization: MissionPersonalizationContext;
  knowledge: PromptKnowledge[];
} {
  const bunshinContext: DailyMissionPlannerInput['bunshin'] = {
    name: input.bunshin.name,
    objectiveSummary: input.bunshin.objectiveSummary,
    audienceSummary: input.bunshin.audienceSummary,
    personalitySummary: input.bunshin.personalitySummary,
    personality: input.personality
      ? {
          versionId: input.personality.id,
          version: input.personality.version,
          tone: input.personality.tone,
          formality: input.personality.formality,
          energyLevel: input.personality.energyLevel,
          expertiseLevel: input.personality.expertiseLevel,
          sentenceStyle: input.personality.sentenceStyle,
          firstPerson: input.personality.firstPerson,
          forbiddenExpressions: input.personality.forbiddenExpressions,
          preferredExpressions: input.personality.preferredExpressions,
          visualDirection: input.personality.visualDirection,
          facePolicy: input.personality.facePolicy,
        }
      : null,
  };
  const strategyContext = {
    concept: input.strategy.concept,
    positioning: input.strategy.positioning,
    targetSummary: input.strategy.targetSummary,
    ctaStrategy: input.strategy.ctaStrategy,
    postingPolicy: input.strategy.postingPolicy,
  };
  return {
    bunshinContext,
    strategyContext,
    plannerPersonalization: buildMissionPersonalizationContext({
      bunshin: bunshinContext,
      socialProfile: input.socialProfile,
      strategy: input.strategy,
      businessProfile: input.history.businessProfile,
      onboardingContext: input.history.onboardingContext,
      behaviorSummary: input.history.behaviorSummary,
      feedbackSummary: input.history.feedbackSummary,
      performanceSummary: input.history.performanceSummary,
    }),
    knowledge: [...(input.officialKnowledge ?? input.grantedKnowledge), ...input.personalMaterials],
  };
}

export async function selectDailyMissionMemories(input: {
  scope: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  };
  serviceSafeMode: boolean;
  allowServiceOwnerMemories: boolean;
  memoryRepository: BunshinMemoryRepository;
  ownerMemories: BunshinMemory[];
  brief: Pick<DailyMissionBrief, 'topic' | 'angle' | 'reason'>;
  pillar: Pick<ContentPillar, 'title' | 'description'>;
  strategyTargetSummary: string;
}): Promise<SelectedBunshinMemory[]> {
  const relevantMemories =
    input.serviceSafeMode && !input.allowServiceOwnerMemories
      ? []
      : await new SelectBunshinMemories(input.memoryRepository).execute({
          ...input.scope,
          query: [
            input.brief.topic,
            input.brief.angle,
            input.brief.reason,
            input.pillar.title,
            input.pillar.description ?? '',
            input.strategyTargetSummary,
          ].join('\n'),
          maxItems: 5,
          maxCharacters: 3000,
        });
  return relevantMemories.length > 0
    ? relevantMemories
    : input.ownerMemories
        .filter(
          (memory) =>
            memory.active &&
            memory.deletedAt === null &&
            memory.sourceType === 'USER_INPUT' &&
            memory.sourceId?.startsWith('daily-action:'),
        )
        .slice(0, 1)
        .map((memory) => ({
          id: memory.id,
          type: memory.type,
          summary: memory.summary?.trim() || memory.content.slice(0, 200),
          content: memory.content,
          selectionReason: '本人がDaily Actionで残した最近の素材',
        }));
}
