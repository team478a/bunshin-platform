import { ListServiceBunshins } from '@bunshin/application';
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
  const service = await context((await params).serviceSlug);
  return { title: `${service.configuration.displayName}｜投稿パートナー` };
}

export default async function ServiceBunshinsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const service = await context((await params).serviceSlug);
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${service.configuration.slug}/bunshins` as Route;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const db = await import('@bunshin/database');
  const bunshins = await new ListServiceBunshins(new db.PrismaBunshinRepository()).execute({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  });
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">あなたの投稿パートナー</p>
          <h1>投稿パートナー</h1>
          <p>あなたらしい発信を一緒に考える相棒です。</p>
        </header>

        <section className="service-entry__card">
          {bunshins.length === 0 ? (
            <div className="empty-state">
              <h2>最初の投稿パートナーを作りましょう</h2>
              <p>4つのかんたんな質問に答えるだけで始められます。</p>
              <Link
                className="button button--primary button--full"
                href={`/s/${service.configuration.slug}/bunshins/new` as Route}
              >
                投稿パートナーを作る
              </Link>
            </div>
          ) : (
            <>
              <div className="section-heading">
                <h2>作成した投稿パートナー</h2>
                <Link href={`/s/${service.configuration.slug}/bunshins/new` as Route}>
                  新しく作る
                </Link>
              </div>
              <ul className="bunshin-card-list">
                {bunshins.map((bunshin) => (
                  <li key={bunshin.id}>
                    <div>
                      <span className="bunshin-avatar" aria-hidden="true">
                        {bunshin.name.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{bunshin.name}</strong>
                        <small>{bunshin.objectiveSummary}</small>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <Link href={`/s/${service.configuration.slug}/home` as Route}>サービスホームへ戻る</Link>
      </article>
    </PublicShell>
  );
}
