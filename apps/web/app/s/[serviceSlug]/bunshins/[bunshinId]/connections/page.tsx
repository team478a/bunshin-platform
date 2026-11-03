import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { PublicShell } from '../../../../../ui/public-shell';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import {
  externalReadGrantOwner,
  externalGrantOwnerView,
} from '../../../../../../src/services/external-read-grant-owner';
import {
  socialAccountConnectionOwner,
  socialAccountConnections,
} from '../../../../../../src/services/social-account-connection-owner';
import { ExternalGrantOwnerCard } from './card';
import { InstagramConnectionCard } from './instagram-card';
export const dynamic = 'force-dynamic';
export default async function ExternalConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
  searchParams: Promise<{ instagramResult?: string }>;
}) {
  const { serviceSlug, bunshinId } = await params;
  const { instagramResult } = await searchParams;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/bunshins/${bunshinId}/connections`)}`,
    );
  const target = await externalReadGrantOwner(serviceSlug, bunshinId, actor.userId).catch(
    (error: unknown) => {
      if (error instanceof ApplicationError && error.code === 'NOT_FOUND') return null;
      throw error;
    },
  );
  if (!target) notFound();
  const [initial, socialTarget] = await Promise.all([
    externalGrantOwnerView(target),
    socialAccountConnectionOwner(serviceSlug, bunshinId, actor.userId),
  ]);
  const connections = await (
    await socialAccountConnections()
  )
    .list(actor.userId, socialTarget.owner)
    .catch((error: unknown) => {
      if (error instanceof ApplicationError && error.code === 'FORBIDDEN') return null;
      throw error;
    });
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <p>{target.serviceName}</p>
        <InstagramConnectionCard
          serviceSlug={serviceSlug}
          bunshinId={bunshinId}
          connections={connections}
          result={instagramResult}
        />
        <ExternalGrantOwnerCard
          key={bunshinId}
          endpoint={`/api/services/${serviceSlug}/bunshins/${bunshinId}/external-read-grants`}
          initial={initial}
        />
        <a href={`/s/${serviceSlug}/bunshins/${bunshinId}`}>投稿パートナーへ戻る</a>
      </main>
    </PublicShell>
  );
}
