import { ListAiProviderConfigurations, ListLineConfigurations } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../src/line/secure-configuration';
import { currentAiProviderEnvironment } from '../../../src/ai/secure-provider-configuration';

export const dynamic = 'force-dynamic';

function statusLabel(ok: boolean, okText = '設定済み', missingText = '設定が必要') {
  return (
    <strong className={ok ? 'status-success' : 'status-warning'}>
      {ok ? okText : missingText}
    </strong>
  );
}

export default async function OperationsAdminPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');

  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin) notFound();

  const environment = getServerEnvironment();
  const lineConfigurations = await new ListLineConfigurations(
    new db.PrismaLineConfigurationRepository(),
  ).execute(user.userId, currentLineEnvironment());
  const activeLine = lineConfigurations.find((item) => item.status === 'ACTIVE');
  const aiConfigurations = await new ListAiProviderConfigurations(
    new db.PrismaAiProviderConfigurationRepository(),
  ).execute(user.userId, currentAiProviderEnvironment());
  const preparedProviders = new Set(aiConfigurations.map((item) => item.provider));

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>運用設定</h1>
        <p>サービスを動かすための設定と、現在の状態をここで確認できます。</p>
      </header>

      <section className="settings-card" aria-labelledby="environment-title">
        <h2 id="environment-title">現在の環境</h2>
        <p>
          <strong>{currentLineEnvironment()}</strong>
        </p>
        <p>別の環境に登録した秘密情報は、この環境から使用できません。</p>
      </section>

      <section className="settings-card" aria-labelledby="ai-settings-title">
        <h2 id="ai-settings-title">AIの設定</h2>
        <p>
          {statusLabel(preparedProviders.size > 0, `${preparedProviders.size}サービス準備済み`)}
        </p>
        <p>文章を作るAIと、話題を調べる検索サービスの予算・APIキーを安全に準備できます。</p>
        <Link href="/admin/ai" className="button button--secondary">
          AIと検索の設定を開く
        </Link>
      </section>

      <section className="settings-card" aria-labelledby="line-settings-title">
        <h2 id="line-settings-title">LINEの設定</h2>
        <p>
          {statusLabel(Boolean(activeLine), '使用中の設定があります', '使用する設定がありません')}
        </p>
        {activeLine ? (
          <p>
            第{activeLine.version}版 ／ 接続確認：
            {activeLine.lastVerifiedAt && !activeLine.lastErrorCategory ? '確認済み' : '確認が必要'}
          </p>
        ) : null}
        <Link href="/admin/line" className="button button--secondary">
          LINEの設定を開く
        </Link>
      </section>

      <section className="settings-card" aria-labelledby="rich-menu-title">
        <h2 id="rich-menu-title">LINEのメニュー</h2>
        <p>{statusLabel(false, '公開中', 'まだ作成されていません')}</p>
        <p>次の実装で、画像とボタンを選び、LINEの下部メニューを公開できるようにします。</p>
      </section>

      <section className="settings-card" aria-labelledby="system-settings-title">
        <h2 id="system-settings-title">初回だけ必要な設定</h2>
        <p>
          暗号化の親鍵：{statusLabel(Boolean(environment.ENCRYPTION_KEY))}
          <br />
          定期処理の鍵：{statusLabel(Boolean(environment.CRON_SECRET))}
        </p>
        <p>これらの値そのものは、安全のため管理画面に表示・保存しません。</p>
      </section>

      <section className="settings-card" aria-labelledby="other-operations-title">
        <h2 id="other-operations-title">その他の運用</h2>
        <nav className="settings-list" aria-label="その他の運用">
          <Link href="/admin/legal" className="settings-row">
            <span>
              <strong>利用規約とプライバシー</strong>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link href="/admin/deletions" className="settings-row">
            <span>
              <strong>退会処理</strong>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </section>
    </main>
  );
}
