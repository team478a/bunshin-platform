import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PublicShell } from '../../../../ui/public-shell';
import { SocialProfileSection } from '../../../../(app)/bunshins/[bunshinId]/social-profile-section';
import { ContentPillarSection } from '../../../../(app)/bunshins/[bunshinId]/content-pillar-section';
import { AccountStrategySection } from '../../../../(app)/bunshins/[bunshinId]/account-strategy-section';
import { WeeklyPlanSection } from '../../../../(app)/bunshins/[bunshinId]/weekly-plan-section';
import { ServiceBunshinEditor } from './service-bunshin-editor';
import { ServiceDailyMissionSection } from './service-daily-mission-section';
import { SimpleFirstPostSetup } from './simple-first-post-setup';
import { BusinessProfileGuide } from './business-profile-guide';
import { BusinessWeeklyOverview } from './business-weekly-overview';
import { BusinessOperatingPattern } from './business-operating-pattern';
import { BusinessResponseInsights } from './business-response-insights';
import { ServiceDeliverySettings } from './service-delivery-settings';
import { DailyActionSection } from './daily-action-section';
import { SocialInsightRecorder } from './social-insight-recorder';
import type { ServiceBunshinDetailModel } from './service-bunshin-detail-data';

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

export function ServiceBunshinDetailView({ model }: { model: ServiceBunshinDetailModel }) {
  const {
    actor,
    service,
    lineResult,
    bunshin,
    capabilities,
    socialProfiles,
    contentPillars,
    accountStrategies,
    weeklyPlans,
    dailyMissions,
    variantPointCost,
    rewardsPilotActive,
    postPerformances,
    videos,
    style,
    deliveryEnabled,
    deliveryPolicy,
    deliveryTime,
    deliveryTimezone,
    today,
    deliverySchedule,
    generationProfile,
    imageCreationAvailable,
    dedicatedLine,
    dedicatedLineConnection,
    dailyActions,
    socialInsightSnapshots,
    successfulBusinessTopic,
    businessProgram,
    isBusinessDailyService,
    approvedBusinessStrategy,
  } = model;

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
                postedMissions={dailyMissions.flatMap((mission) =>
                  mission.postedAt
                    ? [{ id: mission.id, topic: mission.topic, postedAt: mission.postedAt }]
                    : [],
                )}
                initialPostPerformances={postPerformances}
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
