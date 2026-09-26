import 'server-only';
import {
  CreateDailyMission,
  ListDailyMissions,
  type BusinessContentCategory,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import {
  applyServiceContentTerminology,
  serviceContentTerminologyPolicy,
} from './service-content-terminology';
import { inspectDailyMissionContent } from './daily-mission-content-quality';
import type { FallbackFeedbackPreference } from './daily-mission-learning-history';
import { loadServiceGenerationKnowledge } from './service-generation-knowledge';

const FALLBACK_VERSION = 'business-daily-personalized-fallback-v6-grounded-knowledge';
const MAX_FALLBACK_CANDIDATES = 5;

const categoryAngles: Record<BusinessContentCategory, string> = {
  HELPFUL_EXPERTISE: 'お客様が今日から使える、商品・サービス選びの小さなコツ',
  COMPANY_STAFF: '商品やサービスを届ける前に大切にしている準備や仕事の様子',
  FAQ_PROBLEM: 'お客様からよく聞かれる質問への、分かりやすい答え',
  CASE_STUDY: '商品やサービスが役立つ具体的な場面と、利用前に確認したいこと',
  PRODUCT_SERVICE: '商品やサービスの特徴と、どんな方に向いているか',
};

const photoDirections: Record<BusinessContentCategory, string> = {
  HELPFUL_EXPERTISE: '説明するポイントに関係する実物や資料を、明るい場所で正面から撮ります',
  COMPANY_STAFF: '準備中の手元や道具を一つ選び、少し斜め上から撮ります',
  FAQ_PROBLEM: '質問の答えが伝わる実物や案内資料を、文字が読める距離から撮ります',
  CASE_STUDY: '利用場面を想像できる場所や物を、個人が特定されない範囲で撮ります',
  PRODUCT_SERVICE: '商品やサービスの全体が分かる物を、明るい場所で正面から撮ります',
};

function hashtag(value: string) {
  const normalized = value.replace(/[\s#・、。,.!！?？()（）/\\]+/g, '');
  return normalized ? `#${normalized.slice(0, 40)}` : null;
}

export function buildServiceDailyIdeaFallback(input: {
  missionDate: string;
  industry: string;
  businessName: string;
  productService: string;
  targetAudience: string;
  businessFeatures?: string | null;
  preferredTone?: string | null;
  category?: BusinessContentCategory | null;
  serviceSlug?: string;
  platform: string;
  socialPurpose: string;
  strategyTarget: string;
  strategyPositioning: string;
  weeklyGoal: string;
  weeklyAngle: string;
  bunshinObjective: string;
  bunshinAudience: string;
  feedbackPreference?: FallbackFeedbackPreference;
  approvedFact?: string;
  approvedFactLabel?: string;
}) {
  const category = input.category ?? 'PRODUCT_SERVICE';
  const angle = `${categoryAngles[category]}。${input.weeklyAngle}`;
  const topic = `${input.bunshinAudience}へ伝える「${input.weeklyAngle}」と${input.productService}`;
  const approvedFact = input.approvedFact?.trim()
    ? input.approvedFact
        .trim()
        .slice(0, 600)
        .replace(/[。.!！]+$/u, '。')
    : input.businessFeatures?.trim()
      ? input.businessFeatures.trim().replace(/[。.!！]+$/u, '。')
      : `${input.businessName}では、分かりやすいご案内を大切にしています。`;
  const hashtags = [
    hashtag(input.businessName),
    hashtag(input.industry),
    hashtag(input.productService),
  ].filter((value): value is string => Boolean(value));
  const feedbackPreference = input.feedbackPreference ?? 'STANDARD';
  const closing =
    feedbackPreference === 'SOFT_CTA'
      ? 'あとで見返せるよう保存して、必要なときにご確認ください。'
      : feedbackPreference === 'SIMPLE'
        ? 'まずは一つだけ確認してみてください。'
        : `気になる点は${input.businessName}へお気軽にお尋ねください。`;
  // Keep the approved daily fact and Weekly Plan angle as the substantive majority of the post.
  // A long fixed shell would cause otherwise distinct daily facts to become near-duplicates.
  const body = `${input.weeklyAngle}

${approvedFact}

${input.strategyTarget}へ。${input.weeklyGoal}という目的に沿って、${input.strategyPositioning}

${closing}`;
  return applyServiceContentTerminology(
    {
      version: FALLBACK_VERSION,
      topic,
      angle,
      reason: `${FALLBACK_VERSION}: AIを利用できない場合の審査済み予備案です。本人の週間計画と直近フィードバックを使用し、承認済み情報=${input.approvedFactLabel ?? '事業者プロフィール'}、個別化=${input.bunshinObjective}/${input.socialPurpose}、調整=${feedbackPreference}。`,
      body,
      cta: closing,
      hashtags,
      photoInstruction: `「${input.productService}」に関係する被写体を使います。${photoDirections[category]}。周りの不要な物は片付けます。`,
    },
    input.serviceSlug ? serviceContentTerminologyPolicy(input.serviceSlug) : null,
  );
}

export function shouldUseServiceDailyIdeaFallback(error: unknown) {
  if (!(error instanceof ApplicationError)) return false;
  return (
    ['AI_PROVIDER_UNAVAILABLE', 'INTERNAL_ERROR'].includes(error.code) ||
    (error.code === 'FORBIDDEN' && error.message.includes('AI generation limit'))
  );
}

export async function createServiceDailyIdeaFallback(input: {
  workspaceId: string;
  groupId: string;
  bunshinId: string;
  actorUserId: string;
  missionDate: string;
  assistanceLevel?: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
}) {
  const db = await import('@bunshin/database');
  const [profile, socialProfile, weeklyItem, serviceConfiguration, bunshin] = await Promise.all([
    db.prisma.serviceMemberBusinessProfile.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        groupMembership: { status: 'ACTIVE' },
      },
      select: {
        otherIndustryText: true,
        businessName: true,
        productService: true,
        targetAudience: true,
        businessFeatures: true,
        preferredTone: true,
        primaryIndustry: { select: { name: true } },
      },
    }),
    db.prisma.socialProfile.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: { groupId: input.groupId, ownerUserId: input.actorUserId },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        platform: true,
        purpose: true,
        accountStrategies: {
          where: { status: 'APPROVED' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, targetSummary: true, positioning: true },
        },
      },
    }),
    db.prisma.weeklyPlanItem.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        scheduledDate: new Date(`${input.missionDate}T00:00:00.000Z`),
        weeklyPlan: {
          status: 'CONFIRMED',
          bunshin: { groupId: input.groupId, ownerUserId: input.actorUserId },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        businessContentCategory: true,
        goal: true,
        angle: true,
        contentPillarId: true,
        weeklyPlan: { select: { id: true } },
      },
    }),
    db.prisma.serviceConfiguration.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        group: { status: 'ACTIVE' },
      },
      select: { slug: true },
    }),
    db.prisma.bunshin.findFirst({
      where: {
        workspaceId: input.workspaceId,
        id: input.bunshinId,
        groupId: input.groupId,
        ownerUserId: input.actorUserId,
      },
      select: { id: true, objectiveSummary: true, audienceSummary: true },
    }),
  ]);
  const strategy = socialProfile?.accountStrategies[0];
  if (!profile?.primaryIndustry || !socialProfile || !strategy || !weeklyItem || !bunshin)
    throw new ApplicationError(
      'CONTENT_REJECTED',
      'personalized fallback context is unavailable; do not deliver a shared template',
    );
  const serviceKnowledge = await loadServiceGenerationKnowledge({
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    actorUserId: input.actorUserId,
    bunshinId: input.bunshinId,
  });
  const missionRepository = new db.PrismaDailyMissionRepository();
  const from = new Date(`${input.missionDate}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 28);
  const recentMissions = await new ListDailyMissions(missionRepository).execute({
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    bunshinId: input.bunshinId,
    actorUserId: input.actorUserId,
    from: from.toISOString().slice(0, 10),
    to: new Date(new Date(`${input.missionDate}T00:00:00.000Z`).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10),
  });
  const approvedFacts = [
    ...(profile.businessFeatures?.trim()
      ? [{ id: null, label: '事業者プロフィール', content: profile.businessFeatures.trim() }]
      : []),
    ...serviceKnowledge.groupKnowledge
      .filter(({ type, content }) => type !== 'RULE' && content.trim())
      .map(({ chunkId, sourceLabel, content }) => ({
        id: chunkId,
        label: sourceLabel,
        content: content.trim(),
      })),
  ].slice(0, MAX_FALLBACK_CANDIDATES);
  if (approvedFacts.length === 0)
    throw new ApplicationError(
      'CONTENT_REJECTED',
      'personalized fallback has no approved fact; do not deliver a generic template',
    );
  const candidateInput = {
    missionDate: input.missionDate,
    industry: profile.otherIndustryText || profile.primaryIndustry.name,
    businessName: profile.businessName,
    productService: profile.productService,
    targetAudience: profile.targetAudience,
    businessFeatures: profile.businessFeatures,
    preferredTone: profile.preferredTone,
    category: weeklyItem.businessContentCategory ?? null,
    platform: socialProfile.platform,
    socialPurpose: socialProfile.purpose,
    strategyTarget: strategy.targetSummary,
    strategyPositioning: strategy.positioning,
    weeklyGoal: weeklyItem.goal,
    weeklyAngle: weeklyItem.angle,
    bunshinObjective: bunshin.objectiveSummary,
    bunshinAudience: bunshin.audienceSummary,
    feedbackPreference: serviceKnowledge.personalization.fallbackPreference,
    ...(serviceConfiguration ? { serviceSlug: serviceConfiguration.slug } : {}),
  };
  let selected:
    | {
        idea: ReturnType<typeof buildServiceDailyIdeaFallback>;
        content: {
          body: string;
          threadParts: readonly string[];
          cta: string;
          caption: string;
          hashtags: string[];
          photoInstruction: string;
        };
        knowledgeChunkId: string | null;
      }
    | undefined;
  let lastIssue: ReturnType<typeof inspectDailyMissionContent> = null;
  for (const fact of approvedFacts) {
    const idea = buildServiceDailyIdeaFallback({
      ...candidateInput,
      approvedFact: fact.content,
      approvedFactLabel: fact.label,
    });
    const content = {
      body: idea.body,
      threadParts: [] as const,
      cta: idea.cta,
      caption: idea.body,
      hashtags: idea.hashtags,
      photoInstruction: idea.photoInstruction,
    };
    lastIssue = inspectDailyMissionContent({ content, recentMissions });
    if (!lastIssue) {
      selected = { idea, content, knowledgeChunkId: fact.id };
      break;
    }
  }
  if (!selected)
    throw new ApplicationError(
      'CONTENT_REJECTED',
      'all approved fallback candidates failed the same novelty gate as normal generation',
      { candidateCount: approvedFacts.length, lastIssue },
    );
  const { idea, content, knowledgeChunkId } = selected;
  const fallbackSourceTypes = [
    'BUNSHIN_PROFILE',
    'BUSINESS_PROFILE',
    'SOCIAL_PROFILE',
    'ACCOUNT_STRATEGY',
    ...(serviceKnowledge.personalization.feedbackSummary ? ['FEEDBACK_HISTORY'] : []),
  ];
  return new CreateDailyMission(
    missionRepository,
    new db.PrismaBunshinCapabilityAssignmentRepository(),
  ).execute({
    ...input,
    socialProfileId: socialProfile.id,
    weeklyPlanItemId: weeklyItem?.id ?? null,
    missionDate: input.missionDate,
    format: 'TEXT',
    assistanceLevel: input.assistanceLevel ?? 'READY_TO_USE',
    estimatedMinutes: 5,
    topic: idea.topic,
    angle: idea.angle,
    reason: idea.reason,
    qualityScore: null,
    content,
    generationContext: {
      generatedAt: new Date(),
      payload: {
        personality: null,
        selectedMemories: [],
        knowledge: [],
        groupKnowledge: knowledgeChunkId ? [{ id: knowledgeChunkId }] : [],
        socialProfile: { id: socialProfile.id },
        strategy: { id: strategy.id, version: strategy.version },
        weeklyPlan: { id: weeklyItem.weeklyPlan.id },
        contentPillar: { id: weeklyItem.contentPillarId },
        productPack: null,
        campaign: null,
        classification: 'ORGANIC',
        trendCandidates: [],
        promptVersion: FALLBACK_VERSION,
        provider: 'deterministic',
        model: FALLBACK_VERSION,
        quality: { verdict: 'PASS', issueCodes: [], repairCount: 0 },
        personalization: {
          mode: 'FALLBACK',
          sourceTypes: fallbackSourceTypes,
          availableSourceTypes: fallbackSourceTypes,
          onboardingResponse: serviceKnowledge.personalization.references.onboardingResponseId
            ? { id: serviceKnowledge.personalization.references.onboardingResponseId }
            : null,
          businessProfile: serviceKnowledge.personalization.references.businessProfileId
            ? { id: serviceKnowledge.personalization.references.businessProfileId }
            : null,
          weeklyPlanItem: { id: weeklyItem.id },
          recentMissions: recentMissions.map(({ id }) => ({ id })),
          recentActivities: serviceKnowledge.personalization.references.recentActivityIds.map(
            (id) => ({ id }),
          ),
          recentVariants: serviceKnowledge.personalization.references.recentVariantSelectionIds.map(
            (id) => ({
              id,
            }),
          ),
          recentFeedback: serviceKnowledge.personalization.references.recentFeedbackIds.map(
            (id) => ({
              id,
            }),
          ),
          recentDecisions: serviceKnowledge.personalization.references.recentDecisionIds.map(
            (id) => ({ id }),
          ),
          postRecords: serviceKnowledge.personalization.references.recentPostRecordIds.map(
            (id) => ({
              id,
            }),
          ),
          socialInsights: serviceKnowledge.personalization.references.recentSocialInsightIds.map(
            (id) => ({ id }),
          ),
        },
      },
    },
  });
}
