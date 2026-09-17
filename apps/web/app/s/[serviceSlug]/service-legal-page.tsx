import { ServiceParticipationService } from '@bunshin/application';
import type { CSSProperties } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isRouteNotFound } from '../../../src/navigation/route-not-found';
import { resolvePublicServiceContext } from '../../../src/services/public-service';
import { PublicShell } from '../../ui/public-shell';
import { ServiceLegalDocumentContent } from './service-legal-document';

export async function ServiceLegalPage({
  serviceSlug,
  type,
}: {
  serviceSlug: string;
  type: 'TERMS' | 'PRIVACY';
}) {
  try {
    const service = await resolvePublicServiceContext(serviceSlug);
    const db = await import('@bunshin/database');
    const participation = await new ServiceParticipationService(
      new db.PrismaServiceParticipationRepository(),
    ).findView({ slug: serviceSlug, actorUserId: null });
    const document = participation.legalDocuments.find((item) => item.type === type) ?? null;
    const label = type === 'TERMS' ? '利用規約' : 'プライバシーポリシー';
    const style = {
      '--service-primary': service.configuration.brand.primaryColor,
      '--service-secondary': service.configuration.brand.secondaryColor,
      '--service-font': service.configuration.brand.fontFamily,
    } as CSSProperties;

    return (
      <PublicShell showPlatformBrand={false}>
        <article className="service-entry service-legal-document" style={style}>
          <header className="service-entry__header">
            <p className="eyebrow">{service.configuration.displayName}</p>
            <h1>{document?.title ?? label}</h1>
            {document ? <p>第{document.version}版</p> : null}
          </header>
          <section className="service-entry__card service-legal-document__body">
            {document ? (
              <ServiceLegalDocumentContent document={document} />
            ) : (
              <p>現在準備中です。公開までしばらくお待ちください。</p>
            )}
          </section>
          <Link
            className="button button--secondary button--full"
            href={`/s/${serviceSlug}` as Route}
          >
            サービスに戻る
          </Link>
        </article>
      </PublicShell>
    );
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}
