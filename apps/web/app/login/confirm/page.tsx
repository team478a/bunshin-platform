import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { PendingSubmitButton } from '../../ui/pending-submit-button';
import { PublicShell } from '../../ui/public-shell';
import { ServiceAuthBranding } from '../../ui/service-auth-branding';
import { serviceAuthReturnSlug, safeLineAuthReturnPath } from '../../../src/auth/line-return';
import { resolvePublicServiceContext } from '../../../src/services/public-service';
import { serviceAuthBrandForSlug } from '../../../src/services/service-auth-brand';
import { isRouteNotFound } from '../../../src/navigation/route-not-found';
import {
  AuthReturnContextError,
  authReturnAttemptsEnabled,
  authReturnPageRequest,
  readAuthReturnContext,
} from '../../../src/auth/auth-return-attempt';

export default async function LoginConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    authAttempt?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const query = await searchParams;
  if (
    query.authAttempt !== undefined &&
    (typeof query.authAttempt !== 'string' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(query.authAttempt))
  )
    redirect('/login?error=auth-context');
  if (
    query.token_hash === undefined ||
    !/^[A-Za-z0-9_-]+$/.test(query.token_hash) ||
    query.type !== 'email'
  ) {
    redirect('/login?error=1');
  }
  if (query.returnTo !== undefined && typeof query.returnTo !== 'string')
    redirect('/login?error=auth-context');
  const returnTo = safeLineAuthReturnPath(query.returnTo);
  if (query.returnTo && !returnTo) redirect('/login?error=auth-context');
  let browserCanContinue = true;
  if (authReturnAttemptsEnabled() && !query.authAttempt) browserCanContinue = false;
  if (query.authAttempt) {
    try {
      await readAuthReturnContext(
        authReturnPageRequest('/auth/confirm', await headers(), query.authAttempt),
        query.authAttempt,
        { method: 'EMAIL' },
      );
    } catch (error) {
      if (!(error instanceof AuthReturnContextError)) throw error;
      browserCanContinue = false;
    }
  }
  const serviceSlug = serviceAuthReturnSlug(returnTo);
  let serviceConfiguration = null;
  if (serviceSlug) {
    try {
      serviceConfiguration = (await resolvePublicServiceContext(serviceSlug)).configuration;
    } catch (error) {
      if (!isRouteNotFound(error)) throw error;
    }
  }
  const serviceBrand = serviceAuthBrandForSlug(serviceSlug, serviceConfiguration);
  return (
    <PublicShell narrow showPlatformBrand={!serviceBrand}>
      {serviceBrand && (
        <ServiceAuthBranding
          serviceName={serviceBrand.serviceName}
          logoUrl={serviceBrand.logoUrl}
          poweredBy={serviceBrand.poweredBy}
        />
      )}
      <section className="auth-panel" aria-labelledby="confirm-title">
        <div className="echo-motif echo-motif--success" aria-hidden="true" />
        <div className="page-heading page-heading--center">
          <p className="eyebrow">メール確認済み</p>
          <h1 id="confirm-title">
            {serviceBrand ? `${serviceBrand.serviceName}へログイン` : 'ログインを確認'}
          </h1>
          <p>
            {browserCanContinue
              ? serviceBrand
                ? `このブラウザで${serviceBrand.serviceName}にログインします。LINE内で利用する場合、メールリンクをLINEとは別のブラウザで開くとログイン状態は共有されません。`
                : 'このブラウザでワタシワークスを開きます。別のブラウザで開いた場合、元のブラウザのログイン状態とは共有されません。'
              : 'ログインを始めたブラウザの確認情報が見つからないため、この画面ではログインを完了できません。'}
          </p>
        </div>
        {browserCanContinue ? (
          <form className="form-stack" action="/auth/confirm" method="post">
            <input type="hidden" name="token_hash" value={query.token_hash} />
            <input type="hidden" name="type" value="email" />
            {query.authAttempt && (
              <input type="hidden" name="authAttempt" value={query.authAttempt} />
            )}
            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
            <PendingSubmitButton pendingLabel="ログインしています…">
              {serviceBrand ? `${serviceBrand.serviceName}を開く` : 'ワタシワークスへログイン'}
            </PendingSubmitButton>
          </form>
        ) : (
          <div className="form-stack">
            <p className="auth-panel__help">
              LINE内で利用する場合はLINEへ戻り、「LINEでログイン」を選んでください。メールで続ける場合は、ログインを始めたブラウザでメールリンクを開いてください。
            </p>
            <Link
              className="button button--secondary button--full"
              href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'}
            >
              ログイン方法を選び直す
            </Link>
          </div>
        )}
        <p className="auth-panel__help">
          {browserCanContinue
            ? serviceBrand
              ? 'LINE内でログインしたい場合は、この画面を閉じてLINEへ戻り、「LINEでログイン」を選んでください。メールリンクは一度だけ使用できます。'
              : 'このリンクは一度だけ使用できます。LINE内で使う場合は、LINEに戻ってLINEログインをお試しください。'
            : '認証の安全性を保つため、別のブラウザへログイン状態を移すことはできません。'}
        </p>
      </section>
    </PublicShell>
  );
}
