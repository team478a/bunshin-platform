import { PublicShell } from '../ui/public-shell';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <PublicShell narrow>
      <section className="auth-panel" aria-labelledby="login-title">
        <div className="echo-motif" aria-hidden="true" />
        <div className="page-heading page-heading--center">
          <h1 id="login-title">BUNSHINへログイン</h1>
          <p>メールに届くリンクで、すぐにはじめられます。</p>
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
          <button className="button button--primary button--full" type="submit">
            ログインリンクを送る
          </button>
        </form>
        <p className="auth-panel__help">パスワードの入力は必要ありません。</p>
      </section>
    </PublicShell>
  );
}
