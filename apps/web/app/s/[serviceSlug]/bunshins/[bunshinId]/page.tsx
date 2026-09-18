import {
  GetBunshin,
  ListBunshinCapabilityAssignments,
  ListPointRewardCatalog,
  businessGrowthActionForMission,
  businessGrowthProgramStatus,
} from '@bunshin/application';
import {
  ListContentPillars,
  ListDailyMissions,
  ListMissionContentVariants,
  AuthorizeDailyMissionCopy,
  GetMissionDecision,
  ListMissionActivities,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  type SocialProfile,
} from '@bunshin/capability-social';
import type { CSSProperties, ReactNode } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isRouteNotFound } from '../../../../../src/navigation/route-not-found';
import { resolveAuthenticatedMemberServicePage } from '../../../../../src/services/member-service-page';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';
import { readServiceOnboardingSettings } from '../../../../../src/services/service-onboarding-settings';
import { isPromptOnlyImageService } from '../../../../../src/services/service-image-policy';
import { PublicShell } from '../../../../ui/public-shell';
import { SocialProfileSection } from '../../../../(app)/bunshins/[bunshinId]/social-profile-section';
import { ContentPillarSection } from '../../../../(app)/bunshins/[bunshinId]/content-pillar-section';
import { AccountStrategySection } from '../../../../(app)/bunshins/[bunshinId]/account-strategy-section';
import { WeeklyPlanSection } from '../../../../(app)/bunshins/[bunshinId]/weekly-plan-section';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { ServiceBunshinEditor } from './service-bunshin-editor';
import { ServiceDailyMissionSection } from './service-daily-mission-section';
import { SimpleFirstPostSetup } from './simple-first-post-setup';
import { BusinessProfileGuide } from './business-profile-guide';
import { BusinessWeeklyOverview } from './business-weekly-overview';
import { BusinessOperatingPattern } from './business-operating-pattern';
import {
  BusinessResponseInsights,
  buildBusinessResponseInsight,
} from './business-response-insights';
import { ServiceDeliverySettings } from './service-delivery-settings';
import { DailyActionSection, type DailyActionView } from './daily-action-section';
import { SocialInsightRecorder } from './social-insight-recorder';
import { dailyVideoProjectId } from '../../../../../src/services/automatic-daily-video';
import { localDateInTimezone } from '../../../../../src/activity-progress';
import { resolveDeliveryScheduleStatus } from '../../../../../src/services/delivery-schedule-status';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';
import { missionDecisionOrPending } from '../../../../../src/mission-decision-fallback';
import { readBusinessOutcomes } from '../../../../../src/services/business-outcomes';

export const dynamic = 'force-dynamic';

function MemberHomeDrawer({
  title,
  description,
  children,
  label,
}: {
  title: string;
  description: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="service-member-drawer">
      <summary>
        <span>
          {label ? <small>{label}</small> : null}
          <strong>{title}</strong>
          <span>{description}</span>
        </span>
        <span className="service-member-drawer__icon" aria-hidden="true">
          ＋
        </span>
      </summary>
      <div className="service-member-drawer__content">{children}</div>
    </details>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
}): Promise<Metadata> {
  const service = await resolvePublicServiceContext((await params).serviceSlug).catch(() => null);
  return {
    title: service
      ? `${service.configuration.displayName}｜投稿パートナーホーム`
      : '投稿パートナーホーム',
  };
}

export default async function ServiceBunshinDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
  searchParams: Promise<{ lineResult?: string }>;
}) {
  const { serviceSlug, bunshinId } = await params;
  const lineResult = (await searchParams).lineResult;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/bunshins/${bunshinId}`,
  );
  const onboarding = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  const isBusinessDailyService = onboarding.businessProfileEnabled;
  const db = await import('@bunshin/database');
  let bunshin;
  let capabilities;
  let socialProfiles: SocialProfile[];
  let contentPillars;
  let accountStrategies;
  let weeklyPlans;
  let dailyMissions: DailyMissionView[];
  let variantPointCost: number | null = null;
  let rewardsPilotActive = false;
  let businessProgramStartedAt: Date | null = null;
  const videos: Record<string, { href: string; status: string }> = {};
  try {
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId,
      actorUserId: actor.userId,
    };
    const businessProgramProfile = isBusinessDailyService
      ? await db.prisma.serviceMemberBusinessProfile.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId: actor.userId,
            groupMembership: { status: 'ACTIVE' },
          },
          select: { createdAt: true },
        })
      : null;
    businessProgramStartedAt = businessProgramProfile?.createdAt ?? null;
    bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute(scope);
    capabilities = await new ListBunshinCapabilityAssignments(
      new db.PrismaBunshinCapabilityAssignmentRepository(),
    ).execute(scope);
    socialProfiles = await new ListSocialProfiles(new db.PrismaSocialProfileRepository()).execute(
      scope,
    );
    contentPillars = await new ListContentPillars(new db.PrismaContentPillarRepository()).execute(
      scope,
    );
    const strategyRepository = new db.PrismaSocialAccountStrategyRepository();
    accountStrategies = (
      await Promise.all(
        socialProfiles.map((profile) =>
          new ListSocialAccountStrategies(strategyRepository).execute({
            ...scope,
            socialProfileId: profile.id,
          }),
        ),
      )
    ).flat();
    weeklyPlans = await new ListWeeklyPlans(new db.PrismaWeeklyPlanRepository()).execute(scope);
    const missionRepository = new db.PrismaDailyMissionRepository();
    const missionRecords = await new ListDailyMissions(missionRepository).execute(scope);
    const engagementRepository = new db.PrismaMissionEngagementRepository();
    const videoProjects = isBusinessDailyService
      ? []
      : await db.prisma.videoProject.findMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            ownerUserId: actor.userId,
            bunshinId,
            id: {
              in: missionRecords.map((mission) =>
                dailyVideoProjectId(service.workspaceId, bunshinId, mission.id),
              ),
            },
          },
          select: { id: true, status: true },
        });
    for (const mission of missionRecords) {
      const video = videoProjects.find(
        (item) => item.id === dailyVideoProjectId(service.workspaceId, bunshinId, mission.id),
      );
      if (video)
        videos[mission.id] = { href: `/s/${serviceSlug}/videos/${video.id}`, status: video.status };
    }
    const outcomeRepository = new db.PrismaMissionOutcomeRepository();
    const missionStates = await Promise.all(
      missionRecords.map(async (mission) => ({
        decision: await missionDecisionOrPending(() =>
          new GetMissionDecision(engagementRepository).execute({
            ...scope,
            dailyMissionId: mission.id,
          }),
        ),
        post: await outcomeRepository.getPost({ ...scope, dailyMissionId: mission.id }),
        feedback: await outcomeRepository.getFeedback({ ...scope, dailyMissionId: mission.id }),
        activities: await new ListMissionActivities(engagementRepository).execute({
          ...scope,
          dailyMissionId: mission.id,
        }),
        copyAuthorization: await new AuthorizeDailyMissionCopy(missionRepository).execute({
          ...scope,
          dailyMissionId: mission.id,
        }),
      })),
    );
    const missionVariants = await Promise.all(
      missionRecords.map((mission) =>
        new ListMissionContentVariants(new db.PrismaMissionContentVariantRepository()).execute({
          ...scope,
          dailyMissionId: mission.id,
        }),
      ),
    );
    variantPointCost = isBusinessDailyService
      ? null
      : await new ListPointRewardCatalog(new db.PrismaPointRedemptionRepository())
          .execute({
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            actorUserId: actor.userId,
          })
          .then(
            (catalog) =>
              catalog.find(({ rewardType }) => rewardType === 'ALTERNATIVE_PLAN_GENERATION')
                ?.pointCost ?? null,
          )
          .catch(() => null);
    rewardsPilotActive =
      !isBusinessDailyService &&
      Boolean(
        await db
          .getActiveRewardsPilotAccess(db.prisma, {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId: actor.userId,
          })
          .catch(() => null),
      );
    dailyMissions = missionRecords.map((mission, index) => ({
      id: mission.id,
      missionDate: mission.missionDate,
      status: mission.status,
      format: mission.format,
      assistanceLevel: mission.assistanceLevel,
      estimatedMinutes: mission.estimatedMinutes,
      topic: mission.topic,
      angle: mission.angle,
      reason: mission.reason,
      campaignId: mission.campaignId,
      classification: mission.classification,
      qualityScore: mission.qualityScore,
      content: mission.content,
      decision: missionStates[index]!.decision.decision,
      rejectionReason: missionStates[index]!.decision.rejectionReason,
      platform: socialProfiles.find(({ id }) => id === mission.socialProfileId)?.platform ?? null,
      postedAt: missionStates[index]!.post?.postedAt.toISOString() ?? null,
      feedback: missionStates[index]!.feedback?.rating ?? null,
      executionResult: ([...missionStates[index]!.activities]
        .reverse()
        .find(({ type }) =>
          [
            'EXECUTION_COMPLETED',
            'EXECUTION_PARTIAL',
            'EXECUTION_NOT_COMPLETED',
            'EXECUTION_HELP_NEEDED',
          ].includes(type),
        )?.type ?? (missionStates[index]!.post ? 'EXECUTION_COMPLETED' : null)) as Exclude<
        DailyMissionView['executionResult'],
        undefined
      >,
      ...(isBusinessDailyService
        ? {
            businessAction: businessGrowthActionForMission({
              missionDate: mission.missionDate,
              topic: mission.topic,
              ...(businessProgramProfile
                ? { programStartedAt: businessProgramProfile.createdAt }
                : {}),
            }),
          }
        : {}),
      ...(isBusinessDailyService
        ? { businessOutcomes: readBusinessOutcomes(missionStates[index]!.post?.manualMetrics) }
        : {}),
      copyAuthorization: missionStates[index]!.copyAuthorization,
      trendContext: mission.trendContext
        ? {
            whyNow: mission.trendContext.snapshot.candidate.whyNow,
            fitReason: mission.trendContext.snapshot.candidate.fitReason,
          }
        : null,
      externalLinkUsage:
        !isBusinessDailyService && mission.linkUsage
          ? {
              linkName: mission.linkUsage.linkName,
              insertedUrl: mission.linkUsage.insertedUrl,
              expiresAt: mission.linkUsage.expiresAt?.toISOString() ?? null,
              productName: mission.linkUsage.productName,
              campaignName: mission.linkUsage.campaignName,
              advertisingClassification: mission.linkUsage.advertisingClassification,
            }
          : null,
      variants: isBusinessDailyService
        ? []
        : missionVariants[index]!.map(({ id, sequence, content, qualityScore, selectedAt }) => ({
            id,
            sequence,
            content,
            qualityScore,
            selectedAt: selectedAt?.toISOString() ?? null,
          })),
    }));
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
  const notification = await new db.PrismaLineNotificationPreferenceRepository().getScoped({
    workspaceId: service.workspaceId,
    bunshinId,
    actorUserId: actor.userId,
  });
  const deliveryEnabled = Boolean(
    notification.preference?.enabled && notification.preference.notificationConsentAt,
  );
  const deliveryPolicy = onboarding.dailyIdeaDelivery;
  const deliveryTime = notification.preference?.localTime ?? deliveryPolicy.defaultNotificationTime;
  const deliveryTimezone = notification.preference?.timezone ?? 'Asia/Tokyo';
  const today = localDateInTimezone(new Date(), deliveryTimezone);
  const deliverySchedule = resolveDeliveryScheduleStatus({
    today,
    scheduledDates: weeklyPlans
      .filter(({ status }) => status === 'CONFIRMED')
      .flatMap(({ items }) => items.map(({ scheduledDate }) => scheduledDate)),
    missionDates: dailyMissions.map(({ missionDate }) => missionDate),
  });
  const generationProfile = socialProfiles.find(({ status }) => status === 'ACTIVE');
  const promptOnlyImages = isPromptOnlyImageService(service.configuration.slug);
  const imageMembership =
    isBusinessDailyService || promptOnlyImages
      ? null
      : await db.prisma.groupMembership.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId: actor.userId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: {
            featureAssignments: {
              where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
              select: { startsAt: true, endsAt: true },
            },
            group: {
              select: {
                featurePolicies: {
                  where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
                  select: { startsAt: true, endsAt: true },
                },
              },
            },
          },
        });
  const entitlementNow = new Date();
  const isCurrent = (value: { startsAt: Date | null; endsAt: Date | null }) =>
    (!value.startsAt || value.startsAt <= entitlementNow) &&
    (!value.endsAt || value.endsAt > entitlementNow);
  const imageCreationAvailable = Boolean(
    !promptOnlyImages &&
    imageMembership?.featureAssignments.some(isCurrent) &&
    imageMembership.group.featurePolicies.some(isCurrent),
  );
  const approvedBusinessStrategy = isBusinessDailyService
    ? accountStrategies
        .filter(({ status }) => status === 'APPROVED')
        .sort((left, right) => right.version - left.version)[0]
    : undefined;

  const dedicatedLine = await db.prisma.groupLineChannelConfiguration.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      environment: currentLineEnvironment(),
      status: 'ACTIVE',
      lastVerifiedAt: { not: null },
      lastErrorCategory: null,
      group: {
        lineRoutingPolicies: {
          some: { environment: currentLineEnvironment(), mode: 'DEDICATED', pilotEnabled: true },
        },
      },
    },
    select: { id: true },
  });
  const dedicatedLineConnection = dedicatedLine
    ? await db.prisma.groupLineConnection.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: dedicatedLine.id,
          userId: actor.userId,
          status: 'ACTIVE',
          friendshipStatus: 'FOLLOWING',
          notificationConsentAt: { not: null },
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        },
        select: { id: true },
      })
    : null;
  const dailyActions: DailyActionView[] = (
    await db.prisma.bunshinMemory.findMany({
      where: {
        workspaceId: service.workspaceId,
        bunshinId,
        bunshin: { ownerUserId: actor.userId, groupId: service.serviceId },
        sourceType: 'USER_INPUT',
        sourceId: { startsWith: 'daily-action:' },
        active: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
  ).flatMap((memory) => {
    const type = memory.sourceId?.split(':')[1];
    const labels: Record<string, string> = {
      PHOTO: '今日撮った写真',
      CUSTOMER_QUESTION: 'お客様から聞かれた質問',
      VOICE_MEMO: '30秒メモ',
      COMMENT_REPLY: 'コメントへの返信',
      POST_IMPROVEMENT: '過去投稿の改善案',
      REST_REASON: '今日は投稿しない理由',
    };
    if (!type || !labels[type]) return [];
    return [
      {
        id: memory.id,
        type: type as DailyActionView['type'],
        text: memory.content,
        label: labels[type],
        hasPhoto: memory.attachmentStatus === 'READY',
        attachmentStatus: memory.attachmentStatus,
        useForAutomaticImages: memory.automaticImageReference,
        createdAt: memory.createdAt.toISOString(),
      },
    ];
  });
  const socialInsightSnapshots = isBusinessDailyService
    ? await db.prisma.socialInsightSnapshot.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: actor.userId,
          bunshinId,
        },
        orderBy: [{ observedOn: 'desc' }, { updatedAt: 'desc' }],
        take: 12,
      })
    : [];
  const successfulBusinessTopic = isBusinessDailyService
    ? buildBusinessResponseInsight(dailyMissions).bestTopic
    : null;
  const businessProgram = businessProgramStartedAt
    ? businessGrowthProgramStatus({ startedAt: businessProgramStartedAt, currentDate: today })
    : null;
  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">投稿パートナーホーム</p>
          <h1>{bunshin.name}</h1>
          <p>迷ったときは「今日やること」だけ進めれば大丈夫です。</p>
        </header>
        {lineResult === 'connected' && (
          <p className="success-message" role="status">
            LINE接続が完了しました。これで、このサービスからのお知らせを受け取れます。
          </p>
        )}
        {dedicatedLine && !dedicatedLineConnection ? (
          <a href={`/s/${service.configuration.slug}/bunshins/${bunshin.id}/line`}>
            {isBusinessDailyService
              ? 'LINEの接続を確認する'
              : 'LINEの接続と動画の完成通知を確認する'}
          </a>
        ) : null}
        <SimpleFirstPostSetup
          serviceSlug={service.configuration.slug}
          serviceName={service.configuration.displayName}
          bunshinId={bunshin.id}
          topic={bunshin.objectiveSummary}
          audience={bunshin.audienceSummary}
          hasActivePillar={contentPillars.some(({ active }) => active)}
          profiles={socialProfiles}
          strategies={accountStrategies}
          deliveryEnabled={deliveryEnabled}
          deliveryTime={deliveryTime}
          deliverySchedule={deliverySchedule}
          deliveryPolicy={deliveryPolicy}
          serviceLineRequired={Boolean(dedicatedLine)}
          serviceLineConnected={Boolean(dedicatedLineConnection)}
        />
        <section className="service-entry__card" id="today-post">
          <ServiceDailyMissionSection
            endpoint={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/daily-missions`}
            missions={dailyMissions}
            variantPointCost={variantPointCost}
            pointWorkspaceId={service.workspaceId}
            serviceSlug={service.configuration.slug}
            rewardsPilotActive={rewardsPilotActive}
            businessFree={isBusinessDailyService}
            {...(deliverySchedule.state === 'PREPARING' && generationProfile
              ? {
                  generation: {
                    missionDate: today,
                    timezone: deliveryTimezone,
                    socialProfileId: generationProfile.id,
                  },
                }
              : {})}
            videos={videos}
            {...(imageCreationAvailable
              ? { imageCreationBaseHref: `/s/${service.configuration.slug}/images` }
              : {})}
            active={
              capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ===
              'ACTIVE'
            }
          />
        </section>
        <section className="service-member-tools" aria-labelledby="service-member-tools-title">
          <header>
            <p className="eyebrow">必要なときに確認</p>
            <h2 id="service-member-tools-title">その他のメニュー</h2>
            <p>普段は開かなくても大丈夫です。確認したい項目だけ選んでください。</p>
          </header>
          {approvedBusinessStrategy ? (
            <MemberHomeDrawer
              label="最初に1回"
              title="SNSのプロフィールを整える"
              description="自己紹介文をコピーして、Instagramなどのプロフィール欄に貼り付けます。"
            >
              <BusinessProfileGuide
                serviceSlug={service.configuration.slug}
                bunshinId={bunshin.id}
                topic={bunshin.objectiveSummary}
                audience={bunshin.audienceSummary}
                strategy={{
                  socialProfileId: approvedBusinessStrategy.socialProfileId,
                  platform: approvedBusinessStrategy.platform,
                  availableMinutes: approvedBusinessStrategy.availableMinutes,
                  profileDraft: approvedBusinessStrategy.profileDraft,
                  ctaStrategy: approvedBusinessStrategy.ctaStrategy,
                  destinationType: approvedBusinessStrategy.destinationType,
                  destinationDetail: approvedBusinessStrategy.destinationDetail,
                }}
              />
            </MemberHomeDrawer>
          ) : null}
          {isBusinessDailyService ? (
            <MemberHomeDrawer
              title="これからの投稿予定を見る"
              description="投稿パートナーが準備した、今日から1週間分の予定を確認します。"
            >
              <BusinessWeeklyOverview today={today} plans={weeklyPlans} pillars={contentPillars} />
            </MemberHomeDrawer>
          ) : null}
          {bunshin.ownerUserId === actor.userId ? (
            <MemberHomeDrawer
              title="次の投稿に使う情報を残す"
              description="写真やお客様の質問などを1つ残すと、次の投稿づくりに使われます。"
            >
              <section className="service-entry__card" id="daily-action">
                <DailyActionSection
                  endpoint={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/daily-actions`}
                  initialActions={dailyActions}
                  suggestedReuseTopic={successfulBusinessTopic}
                />
              </section>
            </MemberHomeDrawer>
          ) : null}
          {isBusinessDailyService ? (
            <MemberHomeDrawer
              title="投稿後の反応を記録する"
              description="SNSの画面をスクリーンショットで読み取り、反応のよい投稿を見つけます。"
            >
              <SocialInsightRecorder
                endpoint={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/social-insights`}
                profiles={socialProfiles
                  .filter(({ status }) => status === 'ACTIVE')
                  .map(({ id, platform }) => ({ id, platform }))}
                initialSnapshots={socialInsightSnapshots.map((snapshot) => ({
                  id: snapshot.id,
                  socialProfileId: snapshot.socialProfileId,
                  platform: snapshot.platform,
                  observedOn: snapshot.observedOn.toISOString().slice(0, 10),
                  periodStart: snapshot.periodStart?.toISOString().slice(0, 10) ?? null,
                  periodEnd: snapshot.periodEnd?.toISOString().slice(0, 10) ?? null,
                  followers: snapshot.followers,
                  reach: snapshot.reach,
                  impressions: snapshot.impressions,
                  profileViews: snapshot.profileViews,
                  interactions: snapshot.interactions,
                  source: snapshot.source,
                }))}
              />
              <BusinessResponseInsights missions={dailyMissions} />
            </MemberHomeDrawer>
          ) : null}
          {businessProgram ? (
            <MemberHomeDrawer
              title="90日間の進み方を確認する"
              description="現在の段階、次の目標、これまでの成果を確認します。"
            >
              <BusinessOperatingPattern
                program={businessProgram}
                missions={dailyMissions}
                roadmapHref={`/s/${service.configuration.slug}/roadmap`}
                reportHref={`/s/${service.configuration.slug}/90-day-report`}
                {...(approvedBusinessStrategy?.destinationDetail
                  ? { destination: approvedBusinessStrategy.destinationDetail }
                  : {})}
              />
            </MemberHomeDrawer>
          ) : null}
          <MemberHomeDrawer
            title="投稿パートナーの設定を確認・変更する"
            description="配信時間、発信テーマ、利用するSNSなどを変更できます。"
          >
            <div className="service-advanced-settings__content">
              <ServiceDeliverySettings
                serviceSlug={service.configuration.slug}
                bunshinId={bunshin.id}
                enabled={deliveryEnabled}
                localTime={deliveryTime}
              />
              <section className="service-entry__card">
                <ServiceBunshinEditor serviceSlug={service.configuration.slug} bunshin={bunshin} />
              </section>
              <section className="service-entry__card">
                <ContentPillarSection
                  workspaceId={service.workspaceId}
                  bunshinId={bunshin.id}
                  capabilityStatus={
                    capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')
                      ?.status ?? null
                  }
                  pillars={contentPillars}
                  endpointBase={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/content-pillars`}
                  autoStart
                />
              </section>
              <section className="service-entry__card">
                <SocialProfileSection
                  workspaceId={service.workspaceId}
                  bunshinId={bunshin.id}
                  capabilityStatus={
                    capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')
                      ?.status ?? null
                  }
                  profiles={socialProfiles}
                  endpointBase={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/social-profiles`}
                  autoStart
                />
              </section>
              <section className="service-entry__card">
                <AccountStrategySection
                  workspaceId={service.workspaceId}
                  bunshinId={bunshin.id}
                  profiles={socialProfiles}
                  strategies={accountStrategies}
                  active={
                    capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')
                      ?.status === 'ACTIVE'
                  }
                  endpointBase={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/social-account-strategies`}
                />
              </section>
              <section className="service-entry__card">
                <WeeklyPlanSection
                  workspaceId={service.workspaceId}
                  bunshinId={bunshin.id}
                  capabilityStatus={
                    capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')
                      ?.status ?? null
                  }
                  profiles={socialProfiles}
                  pillars={contentPillars}
                  plans={weeklyPlans}
                  endpointBase={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/weekly-plans`}
                  managedGenerationOnly
                />
              </section>
              {dedicatedLine ? (
                <a
                  className="button button--secondary button--full"
                  href={`/s/${service.configuration.slug}/bunshins/${bunshin.id}/line`}
                >
                  LINEの接続状態を確認する
                </a>
              ) : null}
            </div>
          </MemberHomeDrawer>
        </section>
        <Link href={`/s/${service.configuration.slug}/bunshins` as Route}>一覧へ戻る</Link>
      </article>
    </PublicShell>
  );
}
