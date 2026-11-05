import Link from 'next/link';
import { PublicShell } from '../../ui/public-shell';

export default function AdminAccessPage() {
  return (
    <PublicShell narrow>
      <section className="auth-panel" aria-labelledby="admin-access-title">
        <h1 id="admin-access-title">本部管理者のアカウントを確認してください</h1>
        <p>現在のアカウントでは本部管理者の権限を確認できませんでした。</p>
        <p>
          以前のログイン状態が残っている場合があります。別のアカウントで利用するには、
          ログアウトして管理者登録済みのLINEまたはメールでログインしてください。
        </p>
        <form action="/auth/logout" method="post">
          <button className="button button--primary button--full" type="submit">
            ログアウトする
          </button>
        </form>
        <Link href="/login?returnTo=%2Fadmin">管理者ログインを開く</Link>
        <p>ログインし直しても開けない場合は、本部管理者の権限登録をご確認ください。</p>
        <Link href="/">トップへ戻る</Link>
      </section>
    </PublicShell>
  );
}
