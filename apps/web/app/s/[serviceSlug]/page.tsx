import { cache, type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicShell } from '../../ui/public-shell';
import { resolvePublicServiceContext } from '../../../src/services/public-service';
import { currentUserProvider } from '../../../src/auth/current-user';
import { ParticipationForm } from './participation-form';

export const dynamic = 'force-dynamic';

const registrationCopy = {
  PUBLIC: {
    title: 'どなたでも参加できます',
    description: 'ログインしたあと、すぐにサービスを使い始められます。',
    action: 'このサービスをはじめる',
  },
  INVITATION_ONLY: {
    title: '招待された方だけが参加できます',
    description:
      '運営者から届いた招待用のリンクを開いてください。すでに参加済みの方はログインできます。',
    action: '参加済みの方はこちら',
  },
  APPROVAL_REQUIRED: {
    title: '参加には運営者の確認が必要です',
    description: 'ログイン後に参加を申し込み、運営者からの連絡をお待ちください。',
    action: '参加を申し込む',
  },
  CLOSED: {
    title: '現在、新しい参加受付を止めています',
    description: '受付再開については、サービスの運営者へお問い合わせください。',
    action: null,
  },
} as const;

const service = cache(async (slug: string) => {
  try {
    return await resolvePublicServiceContext(slug);
  } catch {
    notFound();
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const { serviceSlug } = await params;
  const context = await service(serviceSlug);
  return {
    title: context.configuration.displayName,
    description: context.configuration.description,
    icons: context.configuration.brand.faviconUrl
      ? { icon: context.configuration.brand.faviconUrl }
      : undefined,
  };
}

export default async function ServiceEntryPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { configuration } = await service(serviceSlug);
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  const db = await import('@bunshin/database');
  const { ServiceParticipationService } = await import('@bunshin/application');
  const participation = await new ServiceParticipationService(
    new db.PrismaServiceParticipationRepository(),
  ).findView({ slug: serviceSlug, actorUserId: currentUser?.userId ?? null });
  const copy = registrationCopy[configuration.registration.mode];
  const returnTo = `/s/${configuration.slug}`;
  const style = {
    '--service-primary': configuration.brand.primaryColor,
    '--service-secondary': configuration.brand.secondaryColor,
    '--service-font': configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <article className="service-entry" style={style}>
        <header className="service-entry__header">
          {configuration.brand.logoUrl && (
            <div
              className="service-entry__logo"
              role="img"
              aria-label={`${configuration.displayName}のロゴ`}
              style={{ backgroundImage: `url(${JSON.stringify(configuration.brand.logoUrl)})` }}
            />
          )}
          <p className="eyebrow">公式サービス</p>
          <h1>{configuration.displayName}</h1>
          <p>{configuration.description}</p>
        </header>

        <section className="service-entry__card" aria-labelledby="registration-title">
          {participation.membership?.status === 'ACTIVE' ? (
            <>
              <h2 id="registration-title">参加手続きは完了しています</h2>
              <p>このサービスを利用できます。</p>
              <Link className="button button--primary button--full" href="/bunshins">
                利用をはじめる
              </Link>
            </>
          ) : participation.membership?.status === 'PENDING_APPROVAL' ? (
            <>
              <h2 id="registration-title">参加申し込みを受け付けました</h2>
              <p>運営者が確認しています。承認されるまで、しばらくお待ちください。</p>
            </>
          ) : currentUser &&
            ['PUBLIC', 'APPROVAL_REQUIRED'].includes(participation.registrationMode) ? (
            <>
              <h2 id="registration-title">{copy.title}</h2>
              <p>{copy.description}</p>
              <ParticipationForm
                documents={participation.legalDocuments}
                requiresApproval={participation.registrationMode === 'APPROVAL_REQUIRED'}
                serviceSlug={serviceSlug}
              />
            </>
          ) : (
            <>
              <h2 id="registration-title">{copy.title}</h2>
              <p>{copy.description}</p>
              {copy.action && !currentUser && configuration.registration.lineEnabled && (
                <form action="/auth/line" method="post">
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <button className="button button--line button--full" type="submit">
                    <span className="button__line-mark" aria-hidden="true">
                      LINE
                    </span>
                    {copy.action}
                  </button>
                </form>
              )}
              {configuration.registration.emailEnabled && copy.action && !currentUser && (
                <Link
                  className="service-entry__login-link"
                  href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                >
                  メールでログインする
                </Link>
              )}
            </>
          )}
        </section>

        <footer className="service-entry__details">
          <span>運営：{configuration.operatorName}</span>
          {configuration.contactEmail && (
            <a href={`mailto:${configuration.contactEmail}`}>お問い合わせ</a>
          )}
          {configuration.termsUrl && <a href={configuration.termsUrl}>利用規約</a>}
          {configuration.privacyUrl && <a href={configuration.privacyUrl}>プライバシー</a>}
          {configuration.poweredByEnabled && <small>Powered by ワタシワークス</small>}
        </footer>
      </article>
    </PublicShell>
  );
}
