import { GetBunshin, ListBunshinCapabilityAssignments } from '@bunshin/application';
import {
  ListContentPillars,
  ListDailyMissions,
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
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { SocialProfileSection } from '../../../../(app)/bunshins/[bunshinId]/social-profile-section';
import { ContentPillarSection } from '../../../../(app)/bunshins/[bunshinId]/content-pillar-section';
import { AccountStrategySection } from '../../../../(app)/bunshins/[bunshinId]/account-strategy-section';
import { WeeklyPlanSection } from '../../../../(app)/bunshins/[bunshinId]/weekly-plan-section';
import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { ServiceBunshinEditor } from './service-bunshin-editor';
import { ServiceDailyMissionSection } from './service-daily-mission-section';

export const dynamic = 'force-dynamic';

async function context(slug: string) {
  try {
    return await resolvePublicServiceContext(slug);
  } catch {
    notFound();
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
    const missionRecords = await new ListDailyMissions(
      new db.PrismaDailyMissionRepository(),
    ).execute(scope);
    const engagementRepository = new db.PrismaMissionEngagementRepository();
    const outcomeRepository = new db.PrismaMissionOutcomeRepository();
    const missionStates = await Promise.all(
      missionRecords.map(async (mission) => ({
        decision: await new GetMissionDecision(engagementRepository).execute({
          ...scope,
          dailyMissionId: mission.id,
        }),
        post: await outcomeRepository.getPost({ ...scope, dailyMissionId: mission.id }),
        feedback: await outcomeRepository.getFeedback({ ...scope, dailyMissionId: mission.id }),
      })),
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
      trendContext: mission.trendContext
        ? {
            whyNow: mission.trendContext.snapshot.candidate.whyNow,
            fitReason: mission.trendContext.snapshot.candidate.fitReason,
            researchedAt: mission.trendContext.createdAt.toISOString(),
            evidence: mission.trendContext.snapshot.evidence.map(
              ({ sourceUrl, sourceTitle, publishedAt, retrievedAt }) => ({
                sourceUrl,
                sourceTitle,
                publishedAt,
                retrievedAt,
              }),
            ),
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
    }));
  } catch {
    notFound();
  }
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">投稿パートナーの設定</p>
          <h1>{bunshin.name}</h1>
          <p>発信内容や話し方を、いつでも変更できます。</p>
        </header>
        <section className="service-entry__card">
          <ServiceBunshinEditor serviceSlug={service.configuration.slug} bunshin={bunshin} />
        </section>
        <section className="service-entry__card">
          <ContentPillarSection
            workspaceId={service.workspaceId}
            bunshinId={bunshin.id}
            capabilityStatus={
              capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ?? null
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
              capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ?? null
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
              capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ?? null
            }
            profiles={socialProfiles}
            pillars={contentPillars}
            plans={weeklyPlans}
            endpointBase={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/weekly-plans`}
            managedGenerationOnly
          />
        </section>
        <section className="service-entry__card">
          <ServiceDailyMissionSection
            endpoint={`/api/services/${encodeURIComponent(service.configuration.slug)}/bunshins/${encodeURIComponent(bunshin.id)}/daily-missions`}
            profiles={socialProfiles}
            missions={dailyMissions}
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
