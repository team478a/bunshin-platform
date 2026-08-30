import { GetBunshin } from '@bunshin/application';
import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ServiceBunshinEditor } from './service-bunshin-editor';

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
  try {
    bunshin = await new GetBunshin(new db.PrismaBunshinRepository()).execute({
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      bunshinId,
      actorUserId: actor.userId,
    });
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
        <Link href={`/s/${service.configuration.slug}/bunshins` as Route}>一覧へ戻る</Link>
      </article>
    </PublicShell>
  );
}
