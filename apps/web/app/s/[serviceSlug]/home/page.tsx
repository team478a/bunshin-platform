import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { PublicShell } from '../../../ui/public-shell';

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
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const { serviceSlug } = await params;
  const { configuration } = await context(serviceSlug);
  return { title: `${configuration.displayName}｜ホーム` };
}

export default async function ServiceMemberHome({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await context(serviceSlug);
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${service.configuration.slug}/home` as Route;
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
    select: {
      id: true,
      role: true,
      user: { select: { displayName: true } },
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

  const now = new Date();
  const active = (value: { startsAt: Date | null; endsAt: Date | null }) =>
    (!value.startsAt || value.startsAt <= now) && (!value.endsAt || value.endsAt > now);
  const available = (featureKey: string) =>
    membership.group.featurePolicies.some(
      (item) => item.featureKey === featureKey && active(item),
    ) &&
    membership.featureAssignments.some((item) => item.featureKey === featureKey && active(item));
  const imageAvailable = available('SOCIAL.IMAGE_GENERATION');
  const videoAvailable = available('VIDEO_GENERATION');
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;
  const groupId = service.serviceId;

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

        <section className="service-entry__card">
          <h2>利用できる機能</h2>
          {!imageAvailable && !videoAvailable && membership.role !== 'MANAGER' && (
            <p>現在、利用できる機能を準備しています。サービス運営者からの案内をお待ちください。</p>
          )}
          <div className="service-home-actions">
            <Link
              className="button button--primary"
              href={`/s/${service.configuration.slug}/bunshins` as Route}
            >
              投稿パートナーを作る・見る
            </Link>
            {imageAvailable && (
              <Link className="button button--primary" href={`/groups/${groupId}/images` as Route}>
                投稿に使う画像を作る
              </Link>
            )}
            {videoAvailable && (
              <Link className="button button--primary" href={`/groups/${groupId}/videos` as Route}>
                投稿に使う動画を作る
              </Link>
            )}
          </div>
        </section>

        {membership.role === 'MANAGER' && (
          <section className="service-entry__card">
            <h2>サービスを管理する</h2>
            <p>参加者、公式資料、利用規約などをこのサービスの範囲だけで管理します。</p>
            <div className="service-home-actions">
              <Link className="button" href={`/groups/${groupId}/members` as Route}>
                参加者と利用機能
              </Link>
              <Link className="button" href={`/groups/${groupId}/knowledge` as Route}>
                公式資料・FAQ
              </Link>
              <Link className="button" href={`/groups/${groupId}/legal` as Route}>
                利用規約
              </Link>
              <Link className="button" href={`/groups/${groupId}/badges` as Route}>
                バッジ
              </Link>
            </div>
          </section>
        )}

        <footer className="service-entry__details">
          <span>運営：{service.configuration.operatorName}</span>
          {service.configuration.contactEmail && (
            <a href={`mailto:${service.configuration.contactEmail}`}>お問い合わせ</a>
          )}
          {service.configuration.poweredByEnabled && <small>Powered by ワタシワークス</small>}
        </footer>
      </article>
    </PublicShell>
  );
}
