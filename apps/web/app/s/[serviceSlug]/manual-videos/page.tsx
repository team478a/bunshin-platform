import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { resolveMemberServiceContext } from '../../../../src/services/public-service';
import { readServiceOnboardingSettings } from '../../../../src/services/service-onboarding-settings';
import { selectServiceMemberRoadmapPolicy } from '../../../../src/services/service-growth-policy';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const manualVideos = [
  {
    episode: 1,
    title: 'ハッシーとは・何ができるのか',
    description: 'ハッシーの目的と、投稿案を確認して自分のSNSへ投稿する流れを紹介します。',
    duration: '約2分24秒',
    src: '/manual-videos/hassy/introduction-v1.mp4',
  },
  {
    episode: 2,
    title: '登録とログインの方法',
    description: 'ハッシーを開き、ログインして最初の設定へ進むまでを実際の画面で説明します。',
    duration: '約1分',
    src: '/manual-videos/hassy/getting-started-v2.mp4',
  },
] as const;

async function memberContext(slug: string, actorUserId: string) {
  try {
    return await resolveMemberServiceContext(slug, actorUserId);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}

export const metadata: Metadata = { title: '動画マニュアル' };

export default async function ServiceManualVideosPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${serviceSlug}/manual-videos` as Route;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);

  const service = await memberContext(serviceSlug, actor.userId);
  const onboarding = readServiceOnboardingSettings(
    service.configuration.registration.onboardingConfig,
    service.configuration.registration.surveyConfig,
  );
  if (!onboarding.businessProfileEnabled || !selectServiceMemberRoadmapPolicy(service)) notFound();

  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home manual-video-library" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">いつでも見返せます</p>
          <h1>動画マニュアル</h1>
          <p>知りたい内容の動画を選んで再生してください。</p>
        </header>

        <div className="manual-video-library__list">
          {manualVideos.map((video) => (
            <section className="service-entry__card manual-video-card" key={video.episode}>
              <div className="manual-video-card__heading">
                <p className="eyebrow">第{video.episode}回</p>
                <h2>{video.title}</h2>
                <small>{video.duration}</small>
              </div>
              <video controls playsInline preload="metadata" aria-label={video.title}>
                <source src={video.src} type="video/mp4" />
                お使いのブラウザでは動画を再生できません。
              </video>
              <p>{video.description}</p>
            </section>
          ))}
        </div>

        <Link
          className="button button--primary button--full"
          href={`/s/${serviceSlug}/home` as Route}
        >
          マイページへ戻る
        </Link>
      </article>
    </PublicShell>
  );
}
