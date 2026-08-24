import {
  CheckLineOperationalReadiness,
  ListAiProviderConfigurations,
  ListLineConfigurations,
  ListLineRichMenus,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../src/line/secure-configuration';
import { currentAiProviderEnvironment } from '../../../src/ai/secure-provider-configuration';
import { operationsReadiness } from './operations-readiness';

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
  const richMenus = await new ListLineRichMenus(new db.PrismaLineRichMenuRepository()).execute({
    actorUserId: user.userId,
    environment: currentLineEnvironment(),
  });
  const lineAssessment = await new CheckLineOperationalReadiness(
    new db.PrismaLineOperationalSnapshotRepository(),
  ).execute(currentLineEnvironment());
  const readiness = operationsReadiness({
    aiConfigurations,
    lineConfigurations,
    lineAssessment,
    richMenus,
    encryptionKeyReady: Boolean(environment.ENCRYPTION_KEY),
    cronSecretReady: Boolean(environment.CRON_SECRET),
    storageReady: Boolean(
      process.env['NEXT_PUBLIC_SUPABASE_URL'] && environment.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });

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

      <section className="settings-card" aria-labelledby="readiness-title">
        <h2 id="readiness-title">いまの運用状態</h2>
        <p>
          {statusLabel(
            readiness.ready,
            '今すぐ直す項目はありません',
            `${readiness.actionRequired}件の対応が必要です`,
          )}
        </p>
        {readiness.checkCount > 0 ? <p>念のため確認する項目：{readiness.checkCount}件</p> : null}
        {readiness.warnings.length > 0 ? (
          <ul>
            {readiness.warnings.map((warning) => (
              <li key={warning.code}>
                <strong>
                  {warning.level === 'ACTION_REQUIRED' ? '対応が必要：' : '確認：'}
                  {warning.title}
                </strong>
                <p>{warning.guidance}</p>
                <Link href={warning.href}>設定を確認する</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>AI、LINE、LINEメニュー、定期処理の設定を確認できました。</p>
        )}
        <Link href="/admin/guide" className="button button--secondary">
          操作と復旧の手順を見る
        </Link>
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
        <p>
          {statusLabel(
            readiness.activeRichMenuVersion !== null,
            `第${readiness.activeRichMenuVersion ?? '-'}版を公開中`,
            '公開中のメニューはありません',
          )}
        </p>
        <p>画像とボタンの並びを選び、LINEの下部メニューを公開・切替・停止できます。</p>
        <Link href="/admin/line" className="button button--secondary">
          LINEメニューを開く
        </Link>
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
          <Link href="/admin/guide" className="settings-row">
            <span>
              <strong>操作と復旧の手順</strong>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
        </nav>
      </section>
    </main>
  );
}
