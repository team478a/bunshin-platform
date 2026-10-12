import { ListAiProviderConfigurations } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { AiProviderConfigurationEditor } from './provider-configuration-editor';

export const dynamic = 'force-dynamic';

export default async function AiProviderConfigurationPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const environment = currentAiProviderEnvironment();
    const configurations = await new ListAiProviderConfigurations(
      new db.PrismaAiProviderConfigurationRepository(),
    ).execute(user.userId, environment);
    return (
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">管理者専用</p>
          <h1>AIと検索サービスの設定</h1>
          <p>文章を作るAIと、話題を調べる検索サービスを準備します。</p>
        </header>
        <section className="settings-card">
          <h2>現在の環境</h2>
          <p>
            <strong>{environment}</strong>
          </p>
          <p>ここで登録した設定は、ほかの環境では使われません。</p>
        </section>
        <AiProviderConfigurationEditor
          environment={environment}
          initialConfigurations={configurations.map((value) => ({
            ...value,
            lastVerifiedAt: value.lastVerifiedAt?.toISOString() ?? null,
            createdAt: value.createdAt.toISOString(),
            updatedAt: value.updatedAt.toISOString(),
          }))}
        />
        <section className="settings-card">
          <h2>トレンド調査サービスをくらべる</h2>
          <p>同じ質問の結果と費用を記録し、Grok・Exa・Firecrawlを公平に比較します。</p>
          <Link href="/admin/ai/benchmark" className="button button--secondary">
            比較画面を開く
          </Link>
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
