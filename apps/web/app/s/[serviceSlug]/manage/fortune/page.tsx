import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { fortuneOperatorStatus } from '../../../../../src/fortune/operator';
import { PublicShell } from '../../../../ui/public-shell';
import { FortuneOperatorEditor } from './fortune-operator-editor';

export const dynamic = 'force-dynamic';

const readinessLabel = (ready: boolean) => (ready ? '準備済み' : '未完了');

export default async function FortuneManagementPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/fortune`)}`);
  const status = await fortuneOperatorStatus(serviceSlug, actor.userId).catch(() => null);
  if (!status) notFound();
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>占いの公開準備</h1>
          <p>解釈の不足や危険な表現を検査し、すべて揃った後にだけ公開できます。</p>
        </header>
        <section className="settings-card fortune-readiness-card">
          <h2>準備状況</h2>
          <dl>
            <div>
              <dt>承認済みの解釈</dt>
              <dd>
                {status.approvedMeaningCount}/{status.requiredMeaningCount}件
              </dd>
            </div>
            <div>
              <dt>利用規約</dt>
              <dd>{readinessLabel(status.termsReady)}</dd>
            </div>
            <div>
              <dt>プライバシーポリシー</dt>
              <dd>{readinessLabel(status.privacyReady)}</dd>
            </div>
            <div>
              <dt>ロゴ・問い合わせ先</dt>
              <dd>{readinessLabel(status.brandReady)}</dd>
            </div>
            <div>
              <dt>占い担当の投稿パートナー</dt>
              <dd>{readinessLabel(status.bunshinReady)}</dd>
            </div>
            <div>
              <dt>公開状態</dt>
              <dd>{status.enabled ? '公開中' : '停止中'}</dd>
            </div>
          </dl>
          {!status.canEnable && <p>未完了の項目を準備すると、公開ボタンを押せるようになります。</p>}
        </section>
        <FortuneOperatorEditor
          serviceSlug={serviceSlug}
          configured={status.configured}
          standardKnowledgeReady={status.approvedMeaningCount === status.requiredMeaningCount}
          enabled={status.enabled}
          aiEnabled={status.aiEnabled}
          canEnable={status.canEnable}
          bunshinId={status.bunshinId}
          bunshins={status.bunshins}
        />
        <a href={`/s/${serviceSlug}/manage`}>運営者メニューへ戻る</a>
      </main>
    </PublicShell>
  );
}
