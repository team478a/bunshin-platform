import { ServiceParticipationService } from '@bunshin/application';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { resolveMemberServiceContext } from '../../../../src/services/public-service';
import { PublicShell } from '../../../ui/public-shell';
import { ServiceLegalConsentForm } from './service-legal-consent-form';

export const dynamic = 'force-dynamic';

export default async function ServiceLegalConsentPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/legal-consent`)}` as Route);
  let service;
  try {
    service = await resolveMemberServiceContext(serviceSlug, actor.userId);
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
  const db = await import('@bunshin/database');
  const view = await new ServiceParticipationService(
    new db.PrismaServiceParticipationRepository(),
  ).findLegalConsentView({ slug: serviceSlug, actorUserId: actor.userId });
  const pending = view.legalDocuments.filter(({ id }) => !view.acceptedDocumentIds.includes(id));
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">{service.configuration.displayName}</p>
          <h1>利用規約などの確認</h1>
          <p>このサービスで現在有効な文書を確認できます。</p>
        </header>
        <section className="settings-card">
          {pending.length > 0 ? (
            <>
              <p>文書が更新されています。内容を確認し、現在の版へ同意してください。</p>
              <ServiceLegalConsentForm
                serviceSlug={service.configuration.slug}
                documents={view.legalDocuments}
              />
            </>
          ) : (
            <p role="status">現在有効な文書への同意は完了しています。</p>
          )}
        </section>
        <Link href={`/s/${service.configuration.slug}/home` as Route}>サービスのホームに戻る</Link>
      </main>
    </PublicShell>
  );
}
