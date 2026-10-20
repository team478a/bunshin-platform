import {
  ListAiProviderConfigurations,
  ListOpenAiProviderRuntimeAdmissions,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { AiProviderConfigurationEditor } from './provider-configuration-editor';
import { AiProviderAdmissionRecovery } from './provider-admission-recovery';

export const dynamic = 'force-dynamic';

export default async function AiProviderConfigurationPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const environment = currentAiProviderEnvironment();
    const repository = new db.PrismaAiProviderConfigurationRepository();
    const [configurations, admissions] = await Promise.all([
      new ListAiProviderConfigurations(repository).execute(user.userId, environment),
      new ListOpenAiProviderRuntimeAdmissions(repository).execute(user.userId, environment),
    ]);
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
        <AiProviderAdmissionRecovery
          initialSummaries={admissions.summaries.map((summary) => ({
            ...summary,
            oldestAdmittedAt: summary.oldestAdmittedAt.toISOString(),
          }))}
          recoveryScanTruncated={admissions.recoveryScanTruncated}
          canRecover={admissions.canRecover}
        />
        <section className="settings-card">
          <h2>AIツールの公式更新情報</h2>
          <p>公式の更新情報を登録し、学習テーマ候補として使う前に運営者が確認できます。</p>
          <Link href="/admin/ai/tool-features" className="button button--secondary">
            更新情報の確認へ
          </Link>
        </section>
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
