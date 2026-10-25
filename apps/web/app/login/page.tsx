import { PublicShell } from '../ui/public-shell';
import { safeLineAuthReturnPath, videoAuthReturnProjectId } from '../../src/auth/line-return';
import { PendingSubmitButton } from '../ui/pending-submit-button';
import { ServiceAuthBranding } from '../ui/service-auth-branding';
import { serviceAuthReturnSlug } from '../../src/auth/line-return';
import { resolvePublicServiceContext } from '../../src/services/public-service';
import { serviceAuthBrandForSlug } from '../../src/services/service-auth-brand';
import { isRouteNotFound } from '../../src/navigation/route-not-found';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeLineAuthReturnPath(query.returnTo);
  const videoProjectId = videoAuthReturnProjectId(returnTo);
  const serviceSlug = serviceAuthReturnSlug(returnTo);
  const returnsToInvitation = Boolean(
    returnTo && /^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*\/join\/[A-Za-z0-9_-]{43}$/.test(returnTo),
  );
  let serviceConfiguration = null;
  if (serviceSlug) {
    try {
      serviceConfiguration = (await resolvePublicServiceContext(serviceSlug)).configuration;
    } catch (error) {
      if (!isRouteNotFound(error)) throw error;
    }
  }
  const serviceBrand = serviceAuthBrandForSlug(serviceSlug, serviceConfiguration);
  const serviceName = serviceBrand?.serviceName;
  return (
    <PublicShell narrow showPlatformBrand={!serviceBrand}>
      {serviceBrand && (
        <ServiceAuthBranding
          serviceName={serviceBrand.serviceName}
          logoUrl={serviceBrand.logoUrl}
          poweredBy={serviceBrand.poweredBy}
        />
      )}
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="echo-motif" aria-hidden="true" />
        <div className="page-heading page-heading--center">
          <h1 id="login-title">
            {serviceName ? `${serviceName}へログイン` : 'ワタシワークスへログイン'}
          </h1>
          <p>
            {serviceName
              ? `${serviceName}の利用を続けるには、LINEまたはメールでログインしてください。`
              : 'LINEなら、すぐにはじめられます。'}
          </p>
        </div>
        {query.sent === '1' && (
          <div className="notice notice--success" role="status">
            <strong>
              {serviceName
                ? `${serviceName}のログインリンクを送信しました`
                : 'メールを送信しました'}
            </strong>
            <span>
              {serviceName
                ? `${serviceName}の利用を続けるリンクを受信箱で確認してください。`
                : '受信箱を確認し、最新のログインリンクを開いてください。'}
            </span>
          </div>
        )}
        {query.error === '1' && (
          <div className="notice notice--danger" role="alert">
            <strong>ログインを完了できませんでした</strong>
            <span>
              LINEの場合はLINEログインを、メールの場合は最新のログインリンクをもう一度お試しください。
            </span>
          </div>
        )}
        {query.error === 'line' && (
          <div className="notice notice--danger" role="alert">
            <strong>LINEログインを完了できませんでした</strong>
            <span>
              LINEの認証を最後まで完了しているかご確認ください。ログイン後もこの画面に戻る場合は、参加登録に使ったLINEアカウントか運営者へご確認ください。
            </span>
          </div>
        )}
        {query.error === 'line-link' && (
          <div className="notice notice--danger" role="alert">
            <strong>LINEを連携できませんでした</strong>
            <span>
              連携を始めたアカウントで操作しているか確認してください。すでに別のアカウントに登録されたLINEは移動できません。解決しない場合は運営者へご相談ください。
            </span>
          </div>
        )}
        {query.error === 'rate-limit' && (
          <div className="notice notice--danger" role="alert">
            <strong>短い時間にメールを送りすぎました</strong>
            <span>
              しばらく待ってから、ボタンを一度だけ押してください。LINEログインは今すぐ使えます。
            </span>
          </div>
        )}
        {query.error === 'auth-context' && (
          <div className="notice notice--danger" role="alert">
            <strong>元のログイン手続きを確認できませんでした</strong>
            <span>
              メールのリンクをGmailなど別のブラウザで開いた可能性があります。ログインを始めたブラウザとメールを開いたブラウザが違うと、安全確認を完了できません。LINE内で利用する場合はLINEへ戻り、「LINEでログイン」を選んでください。メールで続ける場合は、リンクを最初にログインを始めたブラウザで開いてください。
            </span>
          </div>
        )}
        {query.error === 'email' && (
          <div className="notice notice--danger" role="alert">
            <strong>メールを送れませんでした</strong>
            <span>少し時間を空けて再度お試しいただくか、LINEでログインしてください。</span>
          </div>
        )}
        {returnsToInvitation && (
          <div className="notice" role="status">
            LINEログイン後は、ログインを始めたブラウザの招待画面に戻ります。LINEのトーク画面ではなく、戻った招待画面で内容を確認して「同意して参加する」を押してください。
          </div>
        )}
        <form action={videoProjectId ? '/auth/video-line/start' : '/auth/line'} method="post">
          {videoProjectId && <input name="projectId" type="hidden" value={videoProjectId} />}
          {returnTo && <input name="returnTo" type="hidden" value={returnTo} />}
          <PendingSubmitButton
            className="button button--line button--full"
            pendingLabel="LINEを開いています…"
          >
            <span className="button__line-mark" aria-hidden="true">
              LINE
            </span>
            {videoProjectId ? 'LINEで本人確認して動画を見る' : 'LINEでログイン'}
          </PendingSubmitButton>
        </form>
        <div className="auth-divider" aria-hidden="true">
          <span>または</span>
        </div>
        <form className="form-stack" action="/auth/email" method="post">
          {returnTo && <input name="returnTo" type="hidden" value={returnTo} />}
          <label className="field" htmlFor="email">
            <span className="field__label">メールアドレス</span>
            <input
              className="field__control"
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="name@example.com"
              required
            />
          </label>
          <PendingSubmitButton
            className="button button--secondary button--full"
            pendingLabel="メールを送信しています…"
          >
            メールでログイン
          </PendingSubmitButton>
        </form>
        <p className="auth-panel__help">メールログインではパスワードの入力は必要ありません。</p>
      </section>
    </PublicShell>
  );
}
