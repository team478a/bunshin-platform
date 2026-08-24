import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function OperationsGuidePage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  if (!(await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(user.userId)))
    notFound();

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>操作と復旧の手順</h1>
        <p>問題が起きたときは、上から順番に確認してください。</p>
      </header>

      <section className="settings-card">
        <h2>最初にすること</h2>
        <ol>
          <li>運用設定トップの「いまの運用状態」を見る</li>
          <li>「対応が必要」と表示された設定画面を開く</li>
          <li>接続テストを行う</li>
          <li>問題がなければ使用中の版を切り替える</li>
        </ol>
        <Link href="/admin">運用設定へ戻る</Link>
      </section>

      <section className="settings-card" id="production-gate">
        <h2>100人検証を始める前の手順</h2>
        <p>次の項目は、管理画面だけでは安全を確認できません。結果を運用記録へ残します。</p>
        <ol>
          <li>最新mainのMigrationとHealth Smokeが成功していることを確認する</li>
          <li>Supabaseのバックアップ状態を確認し、復元練習を行う</li>
          <li>本番でLINE・メールのログインとログアウトを試す</li>
          <li>スマートフォンで分身作成から投稿完了・感想保存まで通す</li>
          <li>退会処理をdry-runし、対象件数とエラーを確認する</li>
          <li>LINE Webhook、通知上限、緊急停止、Go/No-Goを確認する</li>
          <li>対象commit、実施日時、担当者、結果を記録し、責任者が承認する</li>
        </ol>
        <p>すべて終わるまでは、管理画面の自動確認が緑でも利用者募集を開始しません。</p>
        <Link href="/admin">本番開始の確認画面へ戻る</Link>
      </section>

      <section className="settings-card">
        <h2>AIが文章を作れない</h2>
        <ol>
          <li>AI設定でOpenAIの使用中設定を確認する</li>
          <li>全体停止になっていないか確認する</li>
          <li>接続テストを行う</li>
          <li>予算上限と最終エラーを確認する</li>
          <li>新しい設定版を作った場合は、確認後に使用中へ切り替える</li>
        </ol>
        <p>APIキーそのものを画面、チャット、ログへ貼り付けないでください。</p>
        <Link href="/admin/ai">AI設定を開く</Link>
      </section>

      <section className="settings-card">
        <h2>LINE通知が届かない</h2>
        <ol>
          <li>LINE設定が使用中・確認済みか確認する</li>
          <li>全体停止になっていないか確認する</li>
          <li>配信失敗と再実行待ちの件数を見る</li>
          <li>認証エラーの場合は新しい設定版を作り、接続テスト後に切り替える</li>
          <li>一時障害の場合だけ、安全を確認して再実行する</li>
        </ol>
        <p>同じ通知を何度も送らないよう、原因を確認してから再実行してください。</p>
        <Link href="/admin/line">LINE設定を開く</Link>
      </section>

      <section className="settings-card">
        <h2>LINEメニューが出ない</h2>
        <ol>
          <li>LINE設定が使用中・確認済みであることを確認する</li>
          <li>LINE全体停止を確認する</li>
          <li>メニューが「公開中」になっているか確認する</li>
          <li>エラーの場合は下書きを確認済みに戻し、もう一度公開する</li>
        </ol>
        <Link href="/admin/line">LINEメニューを確認する</Link>
      </section>

      <section className="settings-card">
        <h2>緊急停止</h2>
        <p>誤配信や秘密情報の漏えいが疑われる場合は、送信や生成を先に止めます。</p>
        <ol>
          <li>LINE通知またはAIを全体停止する</li>
          <li>影響した時間、対象、操作した人、理由を記録する</li>
          <li>秘密情報が関係する場合はProvider側で失効・再発行する</li>
          <li>新しい設定版で接続テストする</li>
          <li>安全確認後に使用中へ切り替える</li>
        </ol>
        <p>環境変数に残す親鍵やDB接続情報は、この管理画面では変更しません。</p>
      </section>
    </main>
  );
}
