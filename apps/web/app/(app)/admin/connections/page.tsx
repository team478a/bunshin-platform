import { ListAiProviderConfigurations, ListLineConfigurations } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';

export const dynamic = 'force-dynamic';

const providerLabels = {
  OPENAI: '文章を作るAI（OpenAI）',
  GROK: 'Xの話題を調べるAI（Grok）',
  EXA: '話題を調べる検索（Exa）',
  FIRECRAWL: 'ウェブページを読む検索（Firecrawl）',
} as const;

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

  const [ai, line] = await Promise.all([
    new ListAiProviderConfigurations(new db.PrismaAiProviderConfigurationRepository()).execute(
      actor.userId,
      currentAiProviderEnvironment(),
    ),
    new ListLineConfigurations(new db.PrismaLineConfigurationRepository()).execute(
      actor.userId,
      currentLineEnvironment(),
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

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>APIキーと接続確認</h1>
        <p>外部サービスの秘密情報を安全に登録し、本当に接続できるか確認します。</p>
      </header>

      <section className="settings-card">
        <h2>AI・検索サービス</h2>
        <p>対象環境：{currentAiProviderEnvironment()}</p>
        {latestAi.length ? (
          <ul>
            {latestAi.map((item) => (
              <li key={item.id}>
                <strong>{providerLabels[item.provider]}</strong>：
                {item.apiKeyConfigured ? (item.apiKeyMask ?? 'APIキー登録済み') : 'APIキー未登録'}{' '}
                ／ {verificationLabel(item)} ／ {item.status === 'ACTIVE' ? '使用中' : '停止中'}
              </li>
            ))}
          </ul>
        ) : (
          <p>まだAPIキーは登録されていません。</p>
        )}
        <Link href="/admin/ai" className="button button--secondary">
          APIキーの登録・接続確認を開く
        </Link>
      </section>

      <section className="settings-card">
        <h2>LINE</h2>
        <p>対象環境：{currentLineEnvironment()}</p>
        {latestLine ? (
          <p>
            Login Secret・Messaging Secret・Access Token：登録済み ／{' '}
            {verificationLabel(latestLine)} ／{' '}
            {latestLine.status === 'ACTIVE' ? '使用中' : '停止中'}
          </p>
        ) : (
          <p>LINEの秘密情報はまだ登録されていません。</p>
        )}
        <Link href="/admin/line" className="button button--secondary">
          LINEの登録・接続確認を開く
        </Link>
      </section>

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
