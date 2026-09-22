import 'server-only';
import {
  GroupKnowledgeService,
  selectGroupKnowledgeChunksForPrompt,
  type GroupKnowledgeChunkRecord,
} from '@bunshin/application';
import {
  effectiveServiceContentAssistanceLevel,
  readServiceOnboardingSettings,
  serviceDeliveryDefaultAssistanceLevel,
  type ServiceContentAssistanceLevel,
} from './service-onboarding-settings';
import { businessContentMixKnowledge } from './business-content-mix';
import {
  readServiceOnboardingAnswers,
  serviceOnboardingProposalContext,
} from './service-onboarding-response';
import {
  serviceContentTerminologyKnowledge,
  serviceContentTerminologyPolicy,
} from './service-content-terminology';
import { summarizeMissionLearningHistory } from './daily-mission-learning-history';

export interface ServiceGenerationKnowledgeScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  bunshinId?: string;
}

export const MISSION_EXECUTION_RESULT_TYPES = [
  'EXECUTION_COMPLETED',
  'EXECUTION_PARTIAL',
  'EXECUTION_NOT_COMPLETED',
  'EXECUTION_HELP_NEEDED',
] as const;

type MissionExecutionResultType = (typeof MISSION_EXECUTION_RESULT_TYPES)[number];

export function executionResultKnowledgeForPrompt(
  results: Array<{
    type: MissionExecutionResultType;
    missionDate: string;
    topic: string;
  }>,
) {
  if (results.length === 0) return null;
  const labels: Record<MissionExecutionResultType, string> = {
    EXECUTION_COMPLETED: 'できた',
    EXECUTION_PARTIAL: '一部できた',
    EXECUTION_NOT_COMPLETED: 'できなかった',
    EXECUTION_HELP_NEEDED: 'やり方が分からなかった',
  };
  const latest = results[0]!;
  const nextGuidance =
    latest.type === 'EXECUTION_HELP_NEEDED'
      ? '次回は専門用語を使わず、スマートフォンで迷わずできる一つの操作まで具体的に説明する。'
      : latest.type === 'EXECUTION_NOT_COMPLETED'
        ? '次回は5分以内で終わる一つの行動へ小さくし、準備が必要な案を避ける。'
        : latest.type === 'EXECUTION_PARTIAL'
          ? '次回は前回できた部分を繰り返さず、残りを一つの短い行動にする。'
          : '次回も一つの具体的な行動に絞り、少しだけ次の段階へ進める。';
  return {
    type: 'SERVICE_RECENT_EXECUTION_RESULTS',
    title: '最近の実行結果',
    content: [
      ...results.map(
        (result) => `${result.missionDate}「${result.topic}」: ${labels[result.type]}`,
      ),
      `次回の調整: ${nextGuidance}`,
    ].join('\n'),
  };
}

export interface ServiceBusinessProfileForGeneration {
  industryKey: string;
  industryName: string;
  otherIndustryText: string | null;
  businessName: string;
  region: string | null;
  productService: string;
  primaryPurpose: string;
  targetAudience: string;
  websiteUrl: string | null;
  businessFeatures: string | null;
  priceInformation: string | null;
  preferredTone: string | null;
  requiredContent: string | null;
  forbiddenContent: string | null;
}

export function industrySafetyKnowledgeForPrompt(industryKey: string) {
  const common =
    '確認できない実績、効果、順位、価格、期限を作らない。効果を保証せず、利用者が登録した事実だけを使う。';
  const specific: Record<string, string> = {
    HEALTHCARE:
      '診断、治療、予防効果を断定しない。個人差を無視した表現、受診を妨げる表現、未確認の医療情報を使わない。',
    PROFESSIONAL:
      '個別案件の結果を保証せず、法律・税務・労務などの最終判断を促さない。必要に応じて専門家への個別相談を案内する。',
    FITNESS: '減量、体型、健康効果を保証せず、期間と数値を伴う未確認の成果表現を使わない。',
    REAL_ESTATE: '利回り、価格上昇、契約条件を保証せず、物件や取引条件の未確認情報を作らない。',
  };
  return {
    type: 'SERVICE_INDUSTRY_SAFETY',
    title: '業種別の表現ルール',
    content: [common, specific[industryKey]].filter(Boolean).join('\n'),
  };
}

export function businessProfileKnowledgeForPrompt(
  profile: ServiceBusinessProfileForGeneration | null,
) {
  if (!profile) return [];
  const industry =
    profile.industryName === 'その他' && profile.otherIndustryText
      ? profile.otherIndustryText
      : profile.industryName;
  return [
    {
      type: 'SERVICE_BUSINESS_PROFILE',
      title: '参加企業プロフィール',
      content: [
        `業種: ${industry}`,
        `店舗・会社名: ${profile.businessName}`,
        profile.region ? `活動地域: ${profile.region}` : null,
        `商品・サービス: ${profile.productService}`,
        `発信目的: ${profile.primaryPurpose}`,
        `対象顧客: ${profile.targetAudience}`,
        profile.websiteUrl ? `Webサイト: ${profile.websiteUrl}` : null,
        profile.businessFeatures ? `特徴・選ばれる理由: ${profile.businessFeatures}` : null,
        profile.priceInformation ? `価格・料金の情報: ${profile.priceInformation}` : null,
        profile.preferredTone ? `文章の雰囲気: ${profile.preferredTone}` : null,
        profile.requiredContent ? `必ず入れる内容: ${profile.requiredContent}` : null,
        profile.forbiddenContent ? `使わない内容・表現: ${profile.forbiddenContent}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    industrySafetyKnowledgeForPrompt(profile.industryKey),
  ];
}

export function serviceKnowledgeForPrompt(chunks: GroupKnowledgeChunkRecord[]) {
  const selected = selectGroupKnowledgeChunksForPrompt(chunks);
  return {
    officialKnowledge: selected.map((chunk) => ({
      type: `SERVICE_${chunk.type}`,
      title: chunk.sourceLabel,
      content: chunk.content.trim(),
    })),
    groupKnowledge: selected.map((chunk) => ({
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      type: chunk.type,
      sourceLabel: chunk.sourceLabel,
      content: chunk.content.trim(),
    })),
  };
}

export async function resolveServiceContentAssistanceLevel(
  scope: ServiceGenerationKnowledgeScope,
): Promise<ServiceContentAssistanceLevel | null> {
  const db = await import('@bunshin/database');
  const [registrationPolicy, membership] = await Promise.all([
    db.prisma.serviceRegistrationPolicy.findFirst({
      where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      select: { onboardingConfig: true, surveyConfig: true },
    }),
    db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
  ]);
  if (membership) {
    const now = new Date();
    const enrollment = await db.prisma.programEnrollment.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: membership.id,
        status: 'ACTIVE',
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, supportMode: true },
    });
    if (enrollment) {
      const preference = await db.prisma.programMemberPreference.findUnique({
        where: { programEnrollmentId: enrollment.id },
        select: { preferredSupportMode: true },
      });
      return effectiveServiceContentAssistanceLevel({
        contentMode: readServiceOnboardingSettings(
          registrationPolicy?.onboardingConfig,
          registrationPolicy?.surveyConfig,
        ).dailyIdeaDelivery.contentMode,
        enrollmentSupportMode: enrollment.supportMode,
        ...(preference ? { preferredSupportMode: preference.preferredSupportMode } : {}),
      });
    }
  }
  const dailyDelivery = readServiceOnboardingSettings(
    registrationPolicy?.onboardingConfig,
    registrationPolicy?.surveyConfig,
  ).dailyIdeaDelivery;
  return serviceDeliveryDefaultAssistanceLevel(dailyDelivery);
}

export async function loadServiceGenerationKnowledge(scope: ServiceGenerationKnowledgeScope) {
  const db = await import('@bunshin/database');
  const [
    chunks,
    businessProfile,
    contentAssistanceLevel,
    registrationPolicy,
    serviceConfiguration,
    executionResults,
    onboardingResponse,
    recentActivities,
    recentVariants,
    recentFeedback,
    recentDecisions,
    recentPostRecords,
    recentSocialInsights,
  ] = await Promise.all([
    new GroupKnowledgeService(
      new db.PrismaGroupKnowledgeRepository(),
    ).listApprovedChunksForGeneration({
      ...scope,
      productPackVersionId: null,
    }),
    db.prisma.serviceMemberBusinessProfile.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        groupMembership: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        otherIndustryText: true,
        businessName: true,
        region: true,
        productService: true,
        primaryPurpose: true,
        targetAudience: true,
        websiteUrl: true,
        businessFeatures: true,
        priceInformation: true,
        preferredTone: true,
        requiredContent: true,
        forbiddenContent: true,
        primaryIndustry: { select: { key: true, name: true } },
      },
    }),
    resolveServiceContentAssistanceLevel(scope),
    db.prisma.serviceRegistrationPolicy.findFirst({
      where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      select: { onboardingConfig: true, surveyConfig: true },
    }),
    db.prisma.serviceConfiguration.findFirst({
      where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      select: { slug: true },
    }),
    scope.bunshinId
      ? db.prisma.missionActivity.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            type: { in: [...MISSION_EXECUTION_RESULT_TYPES, 'POSTED'] },
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            type: true,
            dailyMission: { select: { missionDate: true, topic: true } },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 5,
        })
      : Promise.resolve([]),
    db.prisma.serviceOnboardingResponse.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        groupMembership: { status: 'ACTIVE' },
      },
      select: { id: true, answers: true },
    }),
    scope.bunshinId
      ? db.prisma.missionActivity.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            type: true,
            dailyMissionId: true,
            occurredAt: true,
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.missionContentVariantSelection.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            variantId: true,
            dailyMissionId: true,
            selectedAt: true,
            variant: { select: { sequence: true } },
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ selectedAt: 'desc' }, { id: 'desc' }],
          take: 5,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.missionFeedback.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            rating: true,
            updatedAt: true,
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.missionDecision.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            decision: { in: ['ACCEPTED', 'REJECTED'] },
            dailyMission: {
              bunshin: { groupId: scope.groupId, ownerUserId: scope.actorUserId },
            },
          },
          select: {
            id: true,
            decision: true,
            rejectionReason: true,
            rejectionDetail: true,
            decidedAt: true,
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
          take: 12,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.postRecord.findMany({
          where: {
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            actorUserId: scope.actorUserId,
            dailyMission: { bunshin: { groupId: scope.groupId } },
          },
          select: {
            id: true,
            dailyMissionId: true,
            postedAt: true,
            manualMetrics: true,
            dailyMission: { select: { missionDate: true, topic: true, angle: true } },
          },
          orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
          take: 5,
        })
      : Promise.resolve([]),
    scope.bunshinId
      ? db.prisma.socialInsightSnapshot.findMany({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            userId: scope.actorUserId,
            bunshinId: scope.bunshinId,
          },
          select: {
            id: true,
            observedOn: true,
            followers: true,
            reach: true,
            impressions: true,
            profileViews: true,
            interactions: true,
          },
          orderBy: [{ observedOn: 'desc' }, { id: 'desc' }],
          take: 3,
        })
      : Promise.resolve([]),
  ]);
  const dailyIdeaDelivery = readServiceOnboardingSettings(
    registrationPolicy?.onboardingConfig,
    registrationPolicy?.surveyConfig,
  ).dailyIdeaDelivery;
  const businessContentMixEnabled = Boolean(businessProfile && dailyIdeaDelivery.enabled);
  const contentTerminologyPolicy = serviceConfiguration
    ? serviceContentTerminologyPolicy(serviceConfiguration.slug)
    : null;
  const knowledge = serviceKnowledgeForPrompt(chunks);
  const executionKnowledge = executionResultKnowledgeForPrompt(
    executionResults.map((result) => ({
      type: (result.type === 'POSTED'
        ? 'EXECUTION_COMPLETED'
        : result.type) as MissionExecutionResultType,
      missionDate: result.dailyMission.missionDate.toISOString().slice(0, 10),
      topic: result.dailyMission.topic,
    })),
  );
  const normalizedBusinessProfile = businessProfile?.primaryIndustry
    ? {
        industry:
          businessProfile.primaryIndustry.name === 'その他' && businessProfile.otherIndustryText
            ? businessProfile.otherIndustryText
            : businessProfile.primaryIndustry.name,
        businessName: businessProfile.businessName,
        region: businessProfile.region,
        productService: businessProfile.productService,
        primaryPurpose: businessProfile.primaryPurpose,
        targetAudience: businessProfile.targetAudience,
        websiteUrl: businessProfile.websiteUrl,
        businessFeatures: businessProfile.businessFeatures,
        priceInformation: businessProfile.priceInformation,
        preferredTone: businessProfile.preferredTone,
        requiredContent: businessProfile.requiredContent,
        forbiddenContent: businessProfile.forbiddenContent,
      }
    : null;
  const onboardingAnswers = readServiceOnboardingAnswers(onboardingResponse?.answers);
  const learningHistory = summarizeMissionLearningHistory({
    activities: recentActivities,
    variants: recentVariants,
    feedback: recentFeedback,
    decisions: recentDecisions.flatMap((decision) =>
      decision.decision === 'PENDING'
        ? []
        : [
            {
              ...decision,
              decision: decision.decision,
            },
          ],
    ),
    posts: recentPostRecords,
    socialInsights: recentSocialInsights,
  });
  return {
    ...knowledge,
    contentAssistanceLevel,
    dailyIdeaDelivery,
    businessContentMixEnabled,
    contentTerminologyPolicy,
    businessProfile: normalizedBusinessProfile,
    personalization: {
      onboardingContext: serviceOnboardingProposalContext(onboardingAnswers),
      behaviorSummary: learningHistory.behaviorSummary,
      feedbackSummary: learningHistory.feedbackSummary,
      performanceSummary: learningHistory.performanceSummary,
      fallbackPreference: learningHistory.fallbackPreference,
      references: {
        onboardingResponseId: onboardingResponse?.id ?? null,
        businessProfileId: businessProfile?.id ?? null,
        recentActivityIds: recentActivities.map(({ id }) => id),
        recentVariantSelectionIds: recentVariants.map(({ id }) => id),
        recentFeedbackIds: recentFeedback.map(({ id }) => id),
        recentDecisionIds: recentDecisions.map(({ id }) => id),
        recentPostRecordIds: recentPostRecords.map(({ id }) => id),
        recentSocialInsightIds: recentSocialInsights.map(({ id }) => id),
      },
    },
    officialKnowledge: [
      ...serviceContentTerminologyKnowledge(contentTerminologyPolicy),
      ...businessProfileKnowledgeForPrompt(
        businessProfile?.primaryIndustry
          ? {
              industryKey: businessProfile.primaryIndustry.key,
              industryName: businessProfile.primaryIndustry.name,
              otherIndustryText: businessProfile.otherIndustryText,
              businessName: businessProfile.businessName,
              region: businessProfile.region,
              productService: businessProfile.productService,
              primaryPurpose: businessProfile.primaryPurpose,
              targetAudience: businessProfile.targetAudience,
              websiteUrl: businessProfile.websiteUrl,
              businessFeatures: businessProfile.businessFeatures,
              priceInformation: businessProfile.priceInformation,
              preferredTone: businessProfile.preferredTone,
              requiredContent: businessProfile.requiredContent,
              forbiddenContent: businessProfile.forbiddenContent,
            }
          : null,
      ),
      ...(businessContentMixEnabled ? [businessContentMixKnowledge()] : []),
      ...(executionKnowledge ? [executionKnowledge] : []),
      ...knowledge.officialKnowledge,
    ],
  };
}
