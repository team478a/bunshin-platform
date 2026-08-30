import type { CSSProperties } from 'react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolvePublicServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';
import { ServiceBunshinForm } from './service-bunshin-form';
import { ServiceBunshinProposals } from './service-bunshin-proposals';

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
  return { title: `${service.configuration.displayName}｜投稿パートナーを作る` };
}

export default async function NewServiceBunshinPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const service = await context((await params).serviceSlug);
  const actor = await (await currentUserProvider()).getCurrentUser();
  const returnTo = `/s/${service.configuration.slug}/bunshins/new` as Route;
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE' },
    },
    select: { id: true, serviceOnboardingResponse: { select: { id: true } } },
  });
  if (!membership) redirect(`/s/${service.configuration.slug}` as Route);
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry service-member-home" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">
            {membership.serviceOnboardingResponse
              ? '選ぶだけで完成します'
              : '4つの質問で完成します'}
          </p>
          <h1>投稿パートナーを作る</h1>
          <p>むずかしく考えなくて大丈夫です。あとから変更できます。</p>
        </header>
        <section className="service-entry__card">
          {membership.serviceOnboardingResponse ? (
            <ServiceBunshinProposals serviceSlug={service.configuration.slug} />
          ) : (
            <ServiceBunshinForm serviceSlug={service.configuration.slug} />
          )}
        </section>
        <Link href={`/s/${service.configuration.slug}/bunshins` as Route}>作らずに戻る</Link>
      </article>
    </PublicShell>
  );
}
