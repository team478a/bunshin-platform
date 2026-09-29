import { redirect } from 'next/navigation';
import { PendingSubmitButton } from '../../ui/pending-submit-button';
import { PublicShell } from '../../ui/public-shell';

export default async function LoginConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; authAttempt?: string | string[] }>;
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
  return (
    <PublicShell narrow>
      <section className="auth-panel" aria-labelledby="confirm-title">
        <div className="echo-motif echo-motif--success" aria-hidden="true" />
        <div className="page-heading page-heading--center">
          <p className="eyebrow">メール確認済み</p>
          <h1 id="confirm-title">ログインを確認</h1>
          <p>このブラウザでワタシワークスを開きます。</p>
        </div>
        <form className="form-stack" action="/auth/confirm" method="post">
          <input type="hidden" name="token_hash" value={query.token_hash} />
          <input type="hidden" name="type" value="email" />
          {query.authAttempt && (
            <input type="hidden" name="authAttempt" value={query.authAttempt} />
          )}
          <PendingSubmitButton pendingLabel="ログインしています…">
            ワタシワークスへログイン
          </PendingSubmitButton>
        </form>
        <p className="auth-panel__help">このリンクは一度だけ使用できます。</p>
      </section>
    </PublicShell>
  );
}
