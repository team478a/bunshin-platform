import { redirect } from 'next/navigation';
import { PublicShell } from '../../ui/public-shell';

export default async function LoginConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const query = await searchParams;
  if (
    query.token_hash === undefined ||
    !/^[A-Za-z0-9_-]+$/.test(query.token_hash) ||
    query.type !== 'email'
  ) {
    redirect('/login?error=1');
  }
  return (
    <PublicShell narrow>
      <section className="auth-panel" aria-labelledby="confirm-title">
        <div className="echo-motif echo-motif--success" aria-hidden="true" />
        <div className="page-heading page-heading--center">
          <p className="eyebrow">メール確認済み</p>
          <h1 id="confirm-title">ログインを確認</h1>
          <p>このブラウザでBUNSHINを開きます。</p>
        </div>
        <form className="form-stack" action="/auth/confirm" method="post">
          <input type="hidden" name="token_hash" value={query.token_hash} />
          <input type="hidden" name="type" value="email" />
          <button className="button button--primary button--full" type="submit">
            BUNSHINへログイン
          </button>
        </form>
        <p className="auth-panel__help">このリンクは一度だけ使用できます。</p>
      </section>
    </PublicShell>
  );
}
