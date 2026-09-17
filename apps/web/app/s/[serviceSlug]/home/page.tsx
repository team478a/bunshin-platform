import { ListServiceBunshins, businessGrowthProgramStatus } from '@bunshin/application';
import { GetMissionProgress } from '@bunshin/capability-social';
import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { currentActivityContinuityRule } from '../../../../src/activity-continuity-rule';
import {
  localDateInTimezone,
  progressStatusLabel,
  weekRange,
  weeklyCalendar,
} from '../../../../src/activity-progress';
import {
  resolveMemberServiceContext,
  resolvePublicServiceContext,
} from '../../../../src/services/public-service';
import {
  isServiceAnnouncementVisible,
  readServiceAnnouncement,
  readServiceOnboardingSettings,
} from '../../../../src/services/service-onboarding-settings';
import { isPromptOnlyImageService } from '../../../../src/services/service-image-policy';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

async function context(slug: string, actorUserId: string) {
  try {
    return await resolveMemberServiceContext(slug, actorUserId);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  return { title: service ? `${service.configuration.displayName}｜ホーム` : 'サービスホーム' };
}

export default async function ServiceMemberHome({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${serviceSlug}/home` as Route;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const service = await context(serviceSlug, actor.userId);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      role: true,
      serviceRole: true,
      user: { select: { displayName: true } },
      serviceOnboardingResponse: { select: { id: true } },
      serviceMemberBusinessProfile: { select: { id: true, createdAt: true } },
      featureAssignments: {
        where: { status: 'ENABLED' },
        select: { featureKey: true, startsAt: true, endsAt: true },
      },
      group: {
        select: {
          name: true,
          featurePolicies: {
            where: { status: 'ENABLED' },
            select: { featureKey: true, startsAt: true, endsAt: true },
          },
        },
      },
    },
  });
  if (!membership) redirect(`/s/${service.configuration.slug}` as Route);
  const onboarding = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  const isBusinessDailyService = onboarding.businessProfileEnabled;
  const promptOnlyImages = isPromptOnlyImageService(service.configuration.slug);
  const announcement = readServiceAnnouncement(service.configuration.registration.onboardingConfig);
  if (
    (onboarding.questions.length > 0 && !membership.serviceOnboardingResponse) ||
    (onboarding.businessProfileEnabled && !membership.serviceMemberBusinessProfile)
  ) {
    redirect(`/s/${service.configuration.slug}/onboarding` as Route);
  }

  const now = new Date();
  const active = (value: { startsAt: Date | null; endsAt: Date | null }) =>
    (!value.startsAt || value.startsAt <= now) && (!value.endsAt || value.endsAt > now);
  const available = (featureKey: string) =>
    membership.group.featurePolicies.some(
      (item) => item.featureKey === featureKey && active(item),
    ) &&
    membership.featureAssignments.some((item) => item.featureKey === featureKey && active(item));
  const imageAvailable =
    !isBusinessDailyService && !promptOnlyImages && available('SOCIAL.IMAGE_GENERATION');
  const videoAvailable = !isBusinessDailyService && available('VIDEO_GENERATION');
  const rewardsPilotAccess = isBusinessDailyService
    ? null
    : await db.getActiveRewardsPilotAccess(db.prisma, {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        userId: actor.userId,
      });
  const trackingLinkAvailable =
    !isBusinessDailyService &&
    (await db.prisma.externalTrackingSystem.count({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
        allowedDomains: { some: { status: 'ACTIVE' } },
      },
    })) > 0;
  const bunshins = await new ListServiceBunshins(new db.PrismaBunshinRepository()).execute({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  });
  const localDate = localDateInTimezone(now, 'Asia/Tokyo');
  const businessProgram =
    isBusinessDailyService && membership.serviceMemberBusinessProfile
      ? businessGrowthProgramStatus({
          startedAt: membership.serviceMemberBusinessProfile.createdAt,
          currentDate: localDate,
        })
      : null;
  const currentWeek = weekRange(localDate);
  const activityRule = await currentActivityContinuityRule();
  const assignmentRepository = new db.PrismaBunshinCapabilityAssignmentRepository();
  const engagementRepository = new db.PrismaMissionEngagementRepository();
  const activities = (
    await Promise.all(
      bunshins.map(async (bunshin) => {
        const assignment = await assignmentRepository.find({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          actorUserId: actor.userId,
          bunshinId: bunshin.id,
          capabilityType: 'SOCIAL',
        });
        if (assignment?.status !== 'ACTIVE') return null;
        const progress = await new GetMissionProgress(
          assignmentRepository,
          engagementRepository,
        ).execute({
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          actorUserId: actor.userId,
          bunshinId: bunshin.id,
          ...currentWeek,
          weeklyGoal: activityRule.weeklyGoal,
        });
        return { bunshin, progress, calendar: weeklyCalendar(progress) };
      }),
    )
  ).filter((value): value is NonNullable<typeof value> => value !== null);
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <header className="service-entry__header">
          {service.configuration.brand.logoUrl && (
            <div
              className="service-entry__logo"
              role="img"
              aria-label={`${service.configuration.displayName}のロゴ`}
              style={{
                backgroundImage: `url(${JSON.stringify(service.configuration.brand.logoUrl)})`,
              }}
            />
          )}
          <p className="eyebrow">あなたのサービスホーム</p>
          <h1>{service.configuration.displayName}</h1>
          <p>{membership.user.displayName}さん、今日も一緒に進めましょう。</p>
        </header>

        {isServiceAnnouncementVisible(announcement, now) && (
          <section className="service-entry__card" aria-labelledby="service-announcement-title">
            <p className="eyebrow">サービスからのお知らせ</p>
            <h2 id="service-announcement-title">{announcement.title}</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{announcement.message}</p>
          </section>
        )}

        {businessProgram ? (
          <section className="service-entry__card business-roadmap-summary">
            <p className="eyebrow">90日計画 / 第{businessProgram.cycleNumber}期</p>
            <h2>
              {businessProgram.day}日目 / {businessProgram.phase.label}
            </h2>
            <div
              className="business-roadmap__progress"
              role="progressbar"
              aria-label="90日計画の進み具合"
              aria-valuemin={1}
              aria-valuemax={90}
              aria-valuenow={businessProgram.day}
            >
              <span style={{ width: `${businessProgram.progressPercent}%` }} />
            </div>
            <p>{businessProgram.phase.description}</p>
            <Link
              className="button button--secondary button--full"
              href={`/s/${service.configuration.slug}/roadmap` as Route}
            >
              90日計画と現在地を見る
            </Link>
          </section>
        ) : null}

        <section className="service-entry__card">
          <h2>今週の進み具合</h2>
          {bunshins.length === 0 ? (
            <div className="empty-state">
              <p>まずは、投稿を一緒に考えるパートナーを作りましょう。</p>
              <Link
                className="button button--primary button--full"
                href={`/s/${service.configuration.slug}/bunshins/new` as Route}
              >
                投稿パートナーを作る
              </Link>
            </div>
          ) : activities.length === 0 ? (
            <div className="empty-state">
              <p>
                {isBusinessDailyService
                  ? '今日の集客活動が届くと、ここに今週の記録が表示されます。'
                  : '投稿の準備が整うと、ここに今週の記録が表示されます。'}
              </p>
              <Link
                className="button button--primary button--full"
                href={`/s/${service.configuration.slug}/bunshins` as Route}
              >
                投稿パートナーを見る
              </Link>
            </div>
          ) : (
            <div className="service-activity-list">
              {activities.map(({ bunshin, progress, calendar }) => (
                <section className="activity-progress" key={bunshin.id}>
                  <div className="activity-progress__summary">
                    <div>
                      <small>{bunshin.name}</small>
                      <h3>今週 {progress.weekly.confirmedDays}日進みました</h3>
                    </div>
                    <strong>目標 {progress.weeklyGoal}日</strong>
                  </div>
                  <div className="activity-calendar" aria-label={`${bunshin.name}の今週の記録`}>
                    {calendar.map((day) => (
                      <div
                        className={`activity-calendar__day activity-calendar__day--${day.status.toLowerCase()}`}
                        key={day.missionDate}
                      >
                        <time dateTime={day.missionDate}>
                          {new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(
                            new Date(`${day.missionDate}T00:00:00.000Z`),
                          )}
                        </time>
                        <span>{progressStatusLabel[day.status]}</span>
                      </div>
                    ))}
                  </div>
                  <p>
                    {progress.remainingConfirmations === 0
                      ? '今週の目標を達成しました。よく続けられています。'
                      : `あと${progress.remainingConfirmations}日で今週の目標です。`}
                  </p>
                  <Link
                    className="button button--primary button--full"
                    href={`/s/${service.configuration.slug}/bunshins/${bunshin.id}` as Route}
                  >
                    {isBusinessDailyService ? '今日やることを見る' : '今日の投稿案を見る'}
                  </Link>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="service-entry__card">
          <h2>{isBusinessDailyService ? '毎日の集客を進める' : '利用できる機能'}</h2>
          {!isBusinessDailyService &&
            !promptOnlyImages &&
            !imageAvailable &&
            !videoAvailable &&
            !rewardsPilotAccess &&
            !['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(membership.serviceRole) && (
              <p>
                現在、利用できる機能を準備しています。サービス運営者からの案内をお待ちください。
              </p>
            )}
          <div className="service-home-actions">
            {promptOnlyImages && (
              <div className="notice">
                <strong>画像は、画像用の文章をコピーして作ります</strong>
                <p>
                  投稿パートナーに届く「画像用の文章」をコピーし、ChatGPTなどの画像を作れるサービスへ貼り付けて送ってください。
                </p>
                <Link
                  className="button button--primary"
                  href={`/s/${service.configuration.slug}/bunshins` as Route}
                >
                  投稿パートナーを見る
                </Link>
              </div>
            )}
            {rewardsPilotAccess && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/activity#rewards` as Route}
              >
                ポイント・バッジを見る
              </Link>
            )}
            <Link
              className="button button--primary"
              href={`/s/${service.configuration.slug}/weekly-report` as Route}
            >
              今週できたことを見る
            </Link>
            {isBusinessDailyService && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/diagnosis` as Route}
              >
                SNS集客の準備を確認する
              </Link>
            )}
            {isBusinessDailyService && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/90-day-report` as Route}
              >
                90日間の成果を見る
              </Link>
            )}
            {isBusinessDailyService && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/roadmap` as Route}
              >
                90日計画を見る
              </Link>
            )}
            {!isBusinessDailyService && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/activity` as Route}
              >
                活動・紹介を見る
              </Link>
            )}
            {!isBusinessDailyService && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/programs` as Route}
              >
                参加中のプログラムと目標
              </Link>
            )}
            <Link
              className="button button--primary"
              href={`/s/${service.configuration.slug}/bunshins` as Route}
            >
              投稿パートナーを作る・見る
            </Link>
            <Link className="button" href={`/s/${service.configuration.slug}/help` as Route}>
              使い方・困ったとき
            </Link>
            {!isBusinessDailyService && !promptOnlyImages && (
              <Link className="button" href={`/s/${service.configuration.slug}/credits` as Route}>
                画像作成回数を見る
              </Link>
            )}
            {trackingLinkAvailable && (
              <Link
                className="button"
                href={`/s/${service.configuration.slug}/tracking-link` as Route}
              >
                自分の代理店URLを登録する
              </Link>
            )}
            {imageAvailable && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/images` as Route}
              >
                投稿に使う画像を作る
              </Link>
            )}
            {videoAvailable && (
              <Link
                className="button button--primary"
                href={`/s/${service.configuration.slug}/videos` as Route}
              >
                投稿に使う動画を作る
              </Link>
            )}
          </div>
        </section>

        {['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(membership.serviceRole) && (
          <section className="service-entry__card service-management-card">
            <p className="eyebrow">運営者用メニュー</p>
            <h2>サービスを管理する</h2>
            <p>
              最初は「開始準備」を開き、設定漏れを確認してください。以降は目的にあわせて下のメニューを使います。
            </p>
            <div className="service-home-actions">
              <a
                className="button button--primary"
                href={`/s/${service.configuration.slug}/manage`}
              >
                開始準備・設定漏れを確認する
              </a>
              <a className="button" href={`/s/${service.configuration.slug}/manage/settings`}>
                サービスの見た目・登録設定
              </a>
              <a className="button" href={`/s/${service.configuration.slug}/manage/line`}>
                サービス専用LINE
              </a>
              <a className="button" href={`/s/${service.configuration.slug}/manage/members`}>
                参加者と利用機能
              </a>
              {!isBusinessDailyService && (
                <a className="button" href={`/s/${service.configuration.slug}/manage/programs`}>
                  実践プログラム
                </a>
              )}
              {!isBusinessDailyService && (
                <a
                  className="button"
                  href={`/s/${service.configuration.slug}/manage/program-goals`}
                >
                  支援方法と目標候補
                </a>
              )}
              <a className="button" href={`/s/${service.configuration.slug}/manage/characters`}>
                AIキャラクター
              </a>
              <a className="button" href={`/s/${service.configuration.slug}/manage/knowledge`}>
                公式資料・FAQ
              </a>
              <a className="button" href={`/s/${service.configuration.slug}/manage/legal`}>
                利用規約
              </a>
              {!isBusinessDailyService && (
                <>
                  <a className="button" href={`/s/${service.configuration.slug}/manage/badges`}>
                    バッジ
                  </a>
                  <a
                    className="button"
                    href={`/s/${service.configuration.slug}/manage/product-packs`}
                  >
                    公式商品情報
                  </a>
                  <a className="button" href={`/s/${service.configuration.slug}/manage/campaigns`}>
                    参加募集
                  </a>
                  <a
                    className="button"
                    href={`/s/${service.configuration.slug}/manage/external-tracking`}
                  >
                    参加者の専用URL
                  </a>
                </>
              )}
            </div>
          </section>
        )}

        {membership.serviceRole === 'CONTENT_EDITOR' && (
          <section className="service-entry__card">
            <h2>公式コンテンツを管理する</h2>
            <p>
              {isBusinessDailyService
                ? '投稿案の作成に使う公式資料とFAQを管理します。'
                : '公式資料、商品情報、参加募集だけをこのサービスの範囲で管理します。'}
            </p>
            <div className="service-home-actions">
              <a className="button" href={`/s/${service.configuration.slug}/manage/knowledge`}>
                公式資料・FAQ
              </a>
              {!isBusinessDailyService && (
                <>
                  <a
                    className="button"
                    href={`/s/${service.configuration.slug}/manage/product-packs`}
                  >
                    公式商品情報
                  </a>
                  <a className="button" href={`/s/${service.configuration.slug}/manage/campaigns`}>
                    参加募集
                  </a>
                </>
              )}
            </div>
          </section>
        )}

        <footer className="service-entry__details">
          <span>運営：{service.configuration.operatorName}</span>
          <Link href={`/s/${service.configuration.slug}/help` as Route}>使い方・ヘルプ</Link>
          {service.configuration.contactEmail && (
            <a href={`mailto:${service.configuration.contactEmail}`}>お問い合わせ</a>
          )}
          {service.configuration.poweredByEnabled && <small>Powered by ワタシワークス</small>}
        </footer>
      </article>
    </PublicShell>
  );
}
