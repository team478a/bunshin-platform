import {
  ListAdminEmailConfigurations,
  ListAiProviderConfigurations,
  ListLineConfigurations,
} from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentAdminEmailEnvironment } from '../../../../src/email/secure-admin-email-configuration';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';

export const dynamic = 'force-dynamic';

const providerLabels = {
  OPENAI: '文章を作るAI（OpenAI）',
  GROK: 'Xの話題を調べるAI（Grok）',
  EXA: '話題を調べる検索（Exa）',
  FIRECRAWL: 'ウェブページを読む検索（Firecrawl）',
} as const;

const providerOrder = ['OPENAI', 'GROK', 'EXA', 'FIRECRAWL'] as const;

function verificationLabel(value: {
  lastVerifiedAt: Date | null;
  lastErrorCategory: string | null;
}) {
  if (!value.lastVerifiedAt) return '未確認';
  return value.lastErrorCategory ? '接続エラー' : '接続確認済み';
}

export default async function ConnectionsPage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin) notFound();

  const [ai, line, email] = await Promise.all([
    new ListAiProviderConfigurations(new db.PrismaAiProviderConfigurationRepository()).execute(
      actor.userId,
      currentAiProviderEnvironment(),
    ),
    new ListLineConfigurations(new db.PrismaLineConfigurationRepository()).execute(
      actor.userId,
      currentLineEnvironment(),
    ),
    new ListAdminEmailConfigurations(new db.PrismaAdminEmailConfigurationRepository()).execute(
      actor.userId,
      currentAdminEmailEnvironment(),
    ),
  ]);
  const latestAi = Object.values(
    ai.reduce<Partial<Record<(typeof ai)[number]['provider'], (typeof ai)[number]>>>(
      (result, item) => {
        if (!result[item.provider] || result[item.provider]!.version < item.version)
          result[item.provider] = item;
        return result;
      },
      {},
    ),
  );
  const latestLine = line[0] ?? null;
  const latestEmail = email[0] ?? null;
  const allConfiguredServicesReady =
    latestAi.every(
      (item) =>
        item.apiKeyConfigured &&
        item.status === 'ACTIVE' &&
        item.lastVerifiedAt &&
        !item.lastErrorCategory,
    ) &&
    latestAi.length > 0 &&
    latestLine?.status === 'ACTIVE' &&
    latestLine.lastVerifiedAt &&
    !latestLine.lastErrorCategory;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>APIキーと接続確認</h1>
        <p>使うサービス、登録状況、接続確認、使用状態をこの一覧で確認できます。</p>
      </header>

      <section className="settings-card">
        <h2>サービス一覧</h2>
        <p>未登録のサービスも含めて表示しています。上から順に状態を確認してください。</p>
        <div className="settings-status-list">
          {providerOrder.map((provider) => {
            const item = latestAi.find((value) => value.provider === provider) ?? null;
            return (
              <article className="settings-status-item" key={provider}>
                <h3>{providerLabels[provider]}</h3>
                <p>
                  登録：{item?.apiKeyConfigured ? (item.apiKeyMask ?? '登録済み') : '未登録'} ／
                  接続：{item ? verificationLabel(item) : '未確認'} ／ 使用：
                  {item?.status === 'ACTIVE' ? '使用中' : '停止中'}
                </p>
                <p>
                  次にすること：
                  {!item?.apiKeyConfigured
                    ? 'APIキーを登録する'
                    : !item.lastVerifiedAt || item.lastErrorCategory
                      ? '接続できるか確認する'
                      : item.status !== 'ACTIVE'
                        ? '確認済みの設定を使用中にする'
                        : '設定済みです'}
                </p>
                <Link href="/admin/ai" className="button button--secondary">
                  設定画面を開く
                </Link>
              </article>
            );
          })}
          <article className="settings-status-item">
            <h3>障害メール（Resend）</h3>
            <p>
              登録：{latestEmail ? latestEmail.apiKeyMask : '未登録'} ／ 接続：
              {latestEmail ? verificationLabel(latestEmail) : '未確認'} ／ 使用：
              {latestEmail?.status === 'ACTIVE' ? '使用中' : '停止中'}
            </p>
            <p>
              次にすること：
              {!latestEmail
                ? 'APIキー、送信元、通知先を登録する'
                : !latestEmail.lastVerifiedAt || latestEmail.lastErrorCategory
                  ? 'テストメールを送り、受信を確認する'
                  : latestEmail.status !== 'ACTIVE'
                    ? '確認済みの設定を使用中にする'
                    : '設定済みです'}
            </p>
            <Link href="/admin/email" className="button button--secondary">
              設定画面を開く
            </Link>
          </article>
          <article className="settings-status-item">
            <h3>LINE公式アカウント</h3>
            <p>
              登録：{latestLine ? 'Secret・Token登録済み' : '未登録'} ／ 接続：
              {latestLine ? verificationLabel(latestLine) : '未確認'} ／ 使用：
              {latestLine?.status === 'ACTIVE' ? '使用中' : '停止中'}
            </p>
            <p>
              次にすること：
              {!latestLine
                ? 'LINE LoginとMessaging APIの情報を登録する'
                : !latestLine.lastVerifiedAt || latestLine.lastErrorCategory
                  ? '接続テストを行う'
                  : latestLine.status !== 'ACTIVE'
                    ? '確認済みの設定を使用中にする'
                    : '設定済みです'}
            </p>
            <Link href="/admin/line" className="button button--secondary">
              設定画面を開く
            </Link>
          </article>
        </div>
      </section>

      {!allConfiguredServicesReady ? (
        <section className="settings-card">
          <h2>まだ設定が終わっていないサービスがあります</h2>
          <ol>
            <li>使いたいサービスの秘密のキーを登録します。</li>
            <li>接続を確認します。</li>
            <li>確認に成功した設定を使用中にします。</li>
          </ol>
          <p>上の一覧に表示される「次にすること」を順番に行ってください。</p>
        </section>
      ) : null}

      <section className="settings-card">
        <h2>安全のため画面から変更しないもの</h2>
        <p>
          暗号化の親鍵、DB接続情報、定期処理の秘密鍵、Supabaseの管理者鍵、Vercel認証情報は、漏えい時の影響が大きいため環境変数で管理します。
        </p>
        <p>登録済みのAPIキーやSecretの平文は、保存後に再表示しません。</p>
      </section>
    </main>
  );
}
