import {
  GetBunshin,
  ListBunshinCapabilityAssignments,
  ListPointRewardCatalog,
} from '@bunshin/application';
import {
  ListContentPillars,
  ListDailyMissions,
  ListMissionContentVariants,
  AuthorizeDailyMissionCopy,
  GetMissionDecision,
  ListSocialAccountStrategies,
  ListSocialProfiles,
  ListWeeklyPlans,
  type SocialProfile,
} from '@bunshin/capability-social';
import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../../src/navigation/route-not-found';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';
import { readServiceOnboardingSettings } from '../../../../../src/services/service-onboarding-settings';
import { PublicShell } from '../../../../ui/public-shell';
import { SocialProfileSection } from '../../../../(app)/bunshins/[bunshinId]/social-profile-section';
import { ContentPillarSection } from '../../../../(app)/bunshins/[bunshinId]/content-pillar-section';
import { AccountStrategySection } from '../../../../(app)/bunshins/[bunshinId]/account-strategy-section';
import { WeeklyPlanSection } from '../../../../(app)/bunshins/[bunshinId]/weekly-plan-section';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { ServiceBunshinEditor } from './service-bunshin-editor';
import { ServiceDailyMissionSection } from './service-daily-mission-section';
import { SimpleFirstPostSetup } from './simple-first-post-setup';
import { ServiceDeliverySettings } from './service-delivery-settings';
import { DailyActionSection, type DailyActionView } from './daily-action-section';
import { dailyVideoProjectId } from '../../../../../src/services/automatic-daily-video';
import { localDateInTimezone } from '../../../../../src/activity-progress';
import { resolveDeliveryScheduleStatus } from '../../../../../src/services/delivery-schedule-status';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';
import { missionDecisionOrPending } from '../../../../../src/mission-decision-fallback';

export const dynamic = 'force-dynamic';

async function context(slug: string) {
  try {
    return await resolvePublicServiceContext(slug);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
}): Promise<Metadata> {
  const service = await context((await params).serviceSlug);
  return { title: `${service.configuration.displayName}｜投稿パートナー設定` };
}

export default async function ServiceBunshinDetailPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
}) {
  const { serviceSlug, bunshinId } = await params;
  const service = await context(serviceSlug);
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${service.configuration.slug}/bunshins/${bunshinId}` as Route;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
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
  const videos: Record<string, { href: string; status: string }> = {};
  try {
    const scope = {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId,
      actorUserId: actor.userId,
    };
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
    const videoProjects = await db.prisma.videoProject.findMany({
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
    variantPointCost = await new ListPointRewardCatalog(new db.PrismaPointRedemptionRepository())
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
    rewardsPilotActive = Boolean(
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
      copyAuthorization: missionStates[index]!.copyAuthorization,
      trendContext: mission.trendContext
        ? {
            whyNow: mission.trendContext.snapshot.candidate.whyNow,
            fitReason: mission.trendContext.snapshot.candidate.fitReason,
          }
        : null,
      externalLinkUsage: mission.linkUsage
        ? {
            linkName: mission.linkUsage.linkName,
            insertedUrl: mission.linkUsage.insertedUrl,
            expiresAt: mission.linkUsage.expiresAt?.toISOString() ?? null,
            productName: mission.linkUsage.productName,
            campaignName: mission.linkUsage.campaignName,
            advertisingClassification: mission.linkUsage.advertisingClassification,
          }
        : null,
      variants: missionVariants[index]!.map(
        ({ id, sequence, content, qualityScore, selectedAt }) => ({
          id,
          sequence,
          content,
          qualityScore,
          selectedAt: selectedAt?.toISOString() ?? null,
        }),
      ),
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
  const deliveryPolicy = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  ).dailyIdeaDelivery;
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
  const imageMembership = await db.prisma.groupMembership.findFirst({
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
    imageMembership?.featureAssignments.some(isCurrent) &&
    imageMembership.group.featurePolicies.some(isCurrent),
  );

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
        createdAt: memory.createdAt.toISOString(),
      },
    ];
  });
  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">投稿パートナーの設定</p>
          <h1>{bunshin.name}</h1>
          <p>初回設定のあとは、投稿案を自動で準備してLINEでお知らせします。</p>
        </header>
        {dedicatedLine ? (
          <a href={`/s/${service.configuration.slug}/bunshins/${bunshin.id}/line`}>
            LINEの接続と動画の完成通知を確認する
          </a>
        ) : null}
        <SimpleFirstPostSetup
          serviceSlug={service.configuration.slug}
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
        />
        <details className="service-advanced-settings">
          <summary>細かい設定を自分で変える（必要な方だけ）</summary>
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
                  capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ??
                  null
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
                  capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ??
                  null
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
                  capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ===
                  'ACTIVE'
                }
                endpointBase={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/social-account-strategies`}
              />
            </section>
            <section className="service-entry__card">
              <WeeklyPlanSection
                workspaceId={service.workspaceId}
                bunshinId={bunshin.id}
                capabilityStatus={
                  capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ??
                  null
                }
                profiles={socialProfiles}
                pillars={contentPillars}
                plans={weeklyPlans}
                endpointBase={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/weekly-plans`}
                managedGenerationOnly
              />
            </section>
          </div>
        </details>
        {bunshin.ownerUserId === actor.userId ? (
          <section className="service-entry__card" id="daily-action">
            <DailyActionSection
              endpoint={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/daily-actions`}
              initialActions={dailyActions}
            />
          </section>
        ) : null}
        <section className="service-entry__card" id="today-post">
          <ServiceDailyMissionSection
            endpoint={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/daily-missions`}
            missions={dailyMissions}
            variantPointCost={variantPointCost}
            pointWorkspaceId={service.workspaceId}
            serviceSlug={service.configuration.slug}
            rewardsPilotActive={rewardsPilotActive}
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
        <Link href={`/s/${service.configuration.slug}/bunshins` as Route}>一覧へ戻る</Link>
      </article>
    </PublicShell>
  );
}
