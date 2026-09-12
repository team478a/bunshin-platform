import { getServerEnvironment } from '@bunshin/config';
import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { PublicShell } from '../../../ui/public-shell';
import { ServiceReferralShare } from './service-referral-share';

export const dynamic = 'force-dynamic';

const referralStatusLabel = {
  CLICKED: '紹介URLを開きました',
  REGISTERED: 'サービスに参加しました',
  ONBOARDING_COMPLETED: '最初の設定を終えました',
  FIRST_CONTENT_VIEWED: '最初の投稿案を見ました',
  FIRST_POST_REPORTED: '最初の投稿を報告しました',
  REJECTED: '対象外になりました',
} as const;

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
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const { serviceSlug } = await params;
  const service = await context(serviceSlug);
  return { title: `${service.configuration.displayName}｜活動・紹介` };
}

export default async function ServiceMemberActivityPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await context(serviceSlug);
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${serviceSlug}/activity` as Route;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  if (!membership) redirect(`/s/${serviceSlug}` as Route);

  const rewardsPilotAccess = await db.getActiveRewardsPilotAccess(db.prisma, {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    userId: actor.userId,
  });

  const [referralCode, creditAccount, pointAccount, badgeAwards, badgeProgress, badgeAwardCount] =
    await Promise.all([
      service.configuration.registration.referralEnabled
        ? db.prisma.serviceReferralCode.findFirst({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              groupMembershipId: membership.id,
              userId: actor.userId,
              status: 'ACTIVE',
            },
            select: {
              id: true,
              code: true,
              _count: { select: { clicks: true } },
              referrals: {
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: { id: true, status: true, updatedAt: true },
              },
            },
          })
        : null,
      db.prisma.serviceCreditAccount.findFirst({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          groupMembershipId: membership.id,
          userId: actor.userId,
        },
        select: { availableCredits: true },
      }),
      rewardsPilotAccess
        ? db.prisma.pointAccount.findFirst({
            where: { workspaceId: service.workspaceId, userId: actor.userId },
            select: { availablePoints: true },
          })
        : null,
      rewardsPilotAccess
        ? db.prisma.badgeAward.findMany({
            where: {
              workspaceId: service.workspaceId,
              userId: actor.userId,
              groupId: service.serviceId,
              status: 'ACTIVE',
            },
            select: {
              id: true,
              awardedAt: true,
              badgeVersion: { select: { title: true, description: true } },
            },
            orderBy: { awardedAt: 'desc' },
            take: 6,
          })
        : [],
      rewardsPilotAccess
        ? db.prisma.badgeProgress.findMany({
            where: {
              workspaceId: service.workspaceId,
              userId: actor.userId,
              groupId: service.serviceId,
              status: { in: ['IN_PROGRESS', 'ELIGIBLE'] },
            },
            select: {
              id: true,
              currentValue: true,
              targetValue: true,
              badgeVersion: { select: { title: true, description: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 3,
          })
        : [],
      rewardsPilotAccess
        ? db.prisma.badgeAward.count({
            where: {
              workspaceId: service.workspaceId,
              userId: actor.userId,
              groupId: service.serviceId,
              status: 'ACTIVE',
            },
          })
        : 0,
    ]);

  const referralCounts = referralCode
    ? await db.prisma.serviceReferral.groupBy({
        by: ['status'],
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          referralCodeId: referralCode.id,
        },
        _count: true,
      })
    : [];
  const referralValue = referralCode
    ? await (async () => {
        const referralUrl = new URL(
          `/r/${referralCode.code}`,
          getServerEnvironment().APP_URL,
        ).toString();
        return {
          code: referralCode.code,
          referralUrl,
          qrDataUrl: await QRCode.toDataURL(referralUrl, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 320,
          }),
        };
      })()
    : null;
  const successfulReferrals = referralCounts
    .filter(({ status }) => status !== 'REJECTED')
    .reduce((total, value) => total + value._count, 0);
  const firstPosts =
    referralCounts.find(({ status }) => status === 'FIRST_POST_REPORTED')?._count ?? 0;
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">あなたの記録</p>
          <h1>活動・紹介</h1>
          <p>
            {rewardsPilotAccess
              ? 'ポイント、バッジ、紹介、画像作成回数をここで確認できます。'
              : '紹介と画像作成回数をここで確認できます。'}
          </p>
        </header>

        {service.configuration.registration.referralEnabled && (
          <section className="service-entry__card service-activity-dashboard__section">
            <div>
              <p className="eyebrow">紹介する</p>
              <h2>あなたの紹介URL</h2>
              <p>このURLから参加した人は、あなたからの紹介として記録されます。</p>
            </div>
            <ServiceReferralShare
              serviceSlug={serviceSlug}
              serviceName={service.configuration.displayName}
              serviceDescription={service.configuration.description}
              initialValue={referralValue}
            />
            <div className="service-activity-dashboard__stats" aria-label="紹介の状況">
              <div>
                <small>URLを開いた回数</small>
                <strong>{referralCode?._count.clicks ?? 0}回</strong>
              </div>
              <div>
                <small>参加につながった人数</small>
                <strong>{successfulReferrals}人</strong>
              </div>
              <div>
                <small>最初の投稿まで進んだ人数</small>
                <strong>{firstPosts}人</strong>
              </div>
            </div>
            {referralCode && referralCode.referrals.length > 0 && (
              <div className="service-activity-dashboard__history">
                <h3>最近の紹介</h3>
                {referralCode.referrals.map((referral) => (
                  <p key={referral.id}>
                    <span>{referralStatusLabel[referral.status]}</span>
                    <time dateTime={referral.updatedAt.toISOString()}>
                      {referral.updatedAt.toLocaleDateString('ja-JP')}
                    </time>
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {rewardsPilotAccess && (
          <section className="service-entry__card service-activity-dashboard__section" id="rewards">
            <div>
              <p className="eyebrow">続けた記録</p>
              <h2>ポイント・バッジ</h2>
              <p>今日の投稿案を確認したり、投稿を記録したりすると自動で増えます。</p>
            </div>
            <ol className="service-reward-guide">
              <li>今日の投稿案を開く</li>
              <li>SNSへ投稿したら「投稿しました」を押す</li>
              <li>通常1分ほど待って、この画面を開き直す</li>
            </ol>
            <div className="service-activity-dashboard__stats service-activity-dashboard__stats--two">
              <div>
                <small>いま使えるポイント</small>
                <strong>{pointAccount?.availablePoints ?? 0} WP</strong>
              </div>
              <div>
                <small>もらったバッジ</small>
                <strong>{badgeAwardCount}個</strong>
              </div>
            </div>
            <div className="service-home-actions">
              <Link
                className="button button--primary"
                href={`/points?workspaceId=${encodeURIComponent(service.workspaceId)}` as Route}
              >
                ポイントの履歴を見る
              </Link>
              <Link
                className="button"
                href={`/badges?workspaceId=${encodeURIComponent(service.workspaceId)}` as Route}
              >
                バッジの進み具合を見る
              </Link>
            </div>
            {badgeAwards.length === 0 ? (
              <p>最初のバッジを目指して、今日の投稿案を見てみましょう。</p>
            ) : (
              <div className="service-activity-dashboard__badges">
                {badgeAwards.map((award) => (
                  <article key={award.id}>
                    <span aria-hidden="true">★</span>
                    <div>
                      <h3>{award.badgeVersion.title}</h3>
                      <p>{award.badgeVersion.description}</p>
                      <small>{award.awardedAt.toLocaleDateString('ja-JP')}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {badgeProgress.length > 0 && (
              <div className="service-activity-dashboard__progress">
                <h3>もう少しでもらえるバッジ</h3>
                {badgeProgress.map((progress) => {
                  const percent = Math.min(
                    100,
                    Math.round((progress.currentValue / Math.max(1, progress.targetValue)) * 100),
                  );
                  return (
                    <div key={progress.id}>
                      <p>{progress.badgeVersion.title}</p>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                      <small>
                        {progress.currentValue} / {progress.targetValue}
                      </small>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="service-entry__card service-activity-dashboard__section">
          <div>
            <p className="eyebrow">画像を作れる回数</p>
            <h2>画像作成回数</h2>
          </div>
          <div className="service-activity-dashboard__stats service-activity-dashboard__stats--single">
            <div>
              <small>現在の残り</small>
              <strong>{creditAccount?.availableCredits ?? 0}回</strong>
            </div>
          </div>
          <Link className="button" href={`/s/${serviceSlug}/credits` as Route}>
            画像作成回数の履歴を見る
          </Link>
        </section>

        <Link href={`/s/${serviceSlug}/home` as Route}>← サービスホームへ戻る</Link>
      </article>
    </PublicShell>
  );
}
