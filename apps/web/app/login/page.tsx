import { PublicShell } from '../ui/public-shell';
import { safeLineAuthReturnPath } from '../../src/auth/line-return';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeLineAuthReturnPath(query.returnTo);
  return (
    <PublicShell narrow>
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="echo-motif" aria-hidden="true" />
        <div className="page-heading page-heading--center">
          <h1 id="login-title">ワタシワークスへログイン</h1>
          <p>LINEなら、すぐにはじめられます。</p>
        </div>
        {query.sent === '1' && (
          <div className="notice notice--success" role="status">
            <strong>メールを送信しました</strong>
            <span>受信箱を確認し、最新のログインリンクを開いてください。</span>
          </div>
        )}
        {query.error === '1' && (
          <div className="notice notice--danger" role="alert">
            <strong>ログインを完了できませんでした</strong>
            <span>リンクを再送して、最新のメールからもう一度お試しください。</span>
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
        {query.error === 'email' && (
          <div className="notice notice--danger" role="alert">
            <strong>メールを送れませんでした</strong>
            <span>少し時間を空けて再度お試しいただくか、LINEでログインしてください。</span>
          </div>
        )}
        <form action="/auth/line" method="post">
          {returnTo && <input name="returnTo" type="hidden" value={returnTo} />}
          <button className="button button--line button--full" type="submit">
            <span className="button__line-mark" aria-hidden="true">
              LINE
            </span>
            LINEでログイン
          </button>
        </form>
        <div className="auth-divider" aria-hidden="true">
          <span>または</span>
        </div>
        <form className="form-stack" action="/auth/email" method="post">
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
          <button className="button button--secondary button--full" type="submit">
            メールでログイン
          </button>
        </form>
        <p className="auth-panel__help">メールログインではパスワードの入力は必要ありません。</p>
      </section>
    </PublicShell>
  );
}
