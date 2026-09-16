import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { fortuneOperatorStatus } from '../../../../../src/fortune/operator';
import { buildFortuneLaunchSteps } from '../../../../../src/fortune/launch-readiness';
import { PublicShell } from '../../../../ui/public-shell';
import { FortuneOperatorEditor } from './fortune-operator-editor';

export const dynamic = 'force-dynamic';

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
  const launchSteps = buildFortuneLaunchSteps(serviceSlug, status);
  const completedSteps = launchSteps.filter((step) => step.ready).length;
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>占いの公開準備</h1>
          <p>解釈の不足や危険な表現を検査し、すべて揃った後にだけ公開できます。</p>
        </header>
        <section className="settings-card fortune-readiness-card">
          <h2>公開までの準備 {completedSteps}/5</h2>
          <p>「未完了」の項目を上から順番に設定してください。</p>
          <ol className="form-stack">
            {launchSteps.map((step) => (
              <li key={step.key}>
                <strong>
                  {step.ready ? '✓ 準備済み' : '未完了'}：{step.title}
                </strong>
                <p>{step.description}</p>
                {!step.ready && <a href={step.href}>{step.actionLabel}</a>}
              </li>
            ))}
          </ol>
          <dl>
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
