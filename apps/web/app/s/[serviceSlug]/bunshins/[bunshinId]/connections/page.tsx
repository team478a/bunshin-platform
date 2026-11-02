import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { PublicShell } from '../../../../../ui/public-shell';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import {
  externalReadGrantOwner,
  externalGrantOwnerView,
} from '../../../../../../src/services/external-read-grant-owner';
import { ExternalGrantOwnerCard } from './card';
export const dynamic = 'force-dynamic';
export default async function ExternalConnectionsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
}) {
  const { serviceSlug, bunshinId } = await params;
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
  const initial = await externalGrantOwnerView(target);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <p>{target.serviceName}</p>
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
