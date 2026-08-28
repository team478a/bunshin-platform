import { GetAccountDeletionRequest } from '@bunshin/application';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const request = await new GetAccountDeletionRequest(
    new db.PrismaAccountDeletionRequestRepository(),
  ).execute(user.userId);
  return (
    <main className="app-page account-page">
      <header className="app-page__heading">
        <p className="eyebrow">アカウント</p>
        <h1>アカウント</h1>
        <p>利用情報や通知、セキュリティに関する設定を確認できます。</p>
      </header>

      <section className="settings-card" aria-labelledby="content-settings-title">
        <h2 id="content-settings-title">BUNSHINの設定</h2>
        <nav className="settings-list" aria-label="BUNSHINの設定">
          <Link href="/bunshins" className="settings-row">
            <span>
              <strong>BUNSHIN</strong>
              <small>分身の選択・編集</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link href="/knowledge" className="settings-row">
            <span>
              <strong>知識</strong>
              <small>発信に活用する情報</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link href="/groups" className="settings-row">
            <span>
              <strong>グループ</strong>
              <small>参加中のグループと、管理できる機能</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link href="/points" className="settings-row">
            <span>
              <strong>ワタシポイント</strong>
              <small>残高・ため方・最近の履歴</small>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </section>

      <section className="settings-card" aria-labelledby="support-settings-title">
        <h2 id="support-settings-title">サービス情報</h2>
        <nav className="settings-list" aria-label="サービス情報">
          <Link href="/terms" className="settings-row">
            <span>
              <strong>利用規約</strong>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link href="/privacy" className="settings-row">
            <span>
              <strong>プライバシーポリシー</strong>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </section>

      <form action="/auth/logout" method="post">
        <button className="button button--secondary button--full" type="submit">
          ログアウト
        </button>
      </form>

      <section className="danger-zone account-danger-zone" aria-labelledby="danger-zone-title">
        <h2 id="danger-zone-title">退会</h2>
        {request ? (
          <>
            <p>
              退会要求を受け付けました。処理予定: {request.scheduledFor.toLocaleString('ja-JP')}
            </p>
            <p>処理前であれば取り消せます。</p>
            <form action="/account/deletion/cancel" method="post">
              <button className="button button--secondary" type="submit">
                退会要求を取り消す
              </button>
            </form>
          </>
        ) : (
          <>
            <p>退会を要求すると14日間の猶予期間に入ります。この段階ではデータは削除されません。</p>
            <form action="/account/deletion/request" method="post">
              <label>
                <input name="confirmation" value="DELETE" type="checkbox" required />
                退会要求の内容を確認しました
              </label>
              <button className="button button--danger" type="submit">
                退会を要求する
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
