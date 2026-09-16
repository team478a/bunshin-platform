import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import {
  fortuneOperationsQuality,
  fortuneOperatorStatus,
} from '../../../../../src/fortune/operator';
import { buildFortuneLaunchSteps } from '../../../../../src/fortune/launch-readiness';
import { fortuneFailureLabel } from '../../../../../src/fortune/quality';
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
  const quality = status.configured
    ? await fortuneOperationsQuality(serviceSlug, actor.userId).catch(() => null)
    : null;
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
          weeklyNotificationEnabled={status.weeklyNotificationEnabled}
          weeklyNotificationDay={status.weeklyNotificationDay}
          weeklyNotificationHour={status.weeklyNotificationHour}
          timeZone={status.timeZone}
          canEnable={status.canEnable}
          bunshinId={status.bunshinId}
          bunshins={status.bunshins}
        />
        {quality && (
          <section className="settings-card">
            <p className="eyebrow">直近{quality.periodDays}日</p>
            <h2>運用品質：{quality.assessment.label}</h2>
            <p>{quality.assessment.message}</p>
            <dl>
              <div>
                <dt>利用できる参加者</dt>
                <dd>{quality.activeParticipants}人</dd>
              </div>
              <div>
                <dt>占いを利用した人</dt>
                <dd>{quality.activeReaders}人</dd>
              </div>
              <div>
                <dt>占い結果</dt>
                <dd>{quality.readingCount}件</dd>
              </div>
              <div>
                <dt>AIで作成</dt>
                <dd>{quality.aiReadingCount}件</dd>
              </div>
              <div>
                <dt>安全な標準文を表示</dt>
                <dd>{quality.basicReadingCount}件</dd>
              </div>
              <div>
                <dt>完了できなかった結果</dt>
                <dd>{quality.failedReadingCount}件</dd>
              </div>
              <div>
                <dt>処理が止まっている結果</dt>
                <dd>{quality.staleGeneratingCount}件</dd>
              </div>
            </dl>
            {quality.failures.length > 0 && (
              <div>
                <h3>標準文への切り替え・失敗理由</h3>
                <ul>
                  {quality.failures.map((failure) => (
                    <li key={failure.code}>
                      {fortuneFailureLabel(failure.code)}：{failure.count}件
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p>この画面には利用者の氏名や占い内容を表示しません。</p>
          </section>
        )}
        {status.configured && !quality && (
          <section className="settings-card">
            <h2>運用品質を確認できませんでした</h2>
            <p>時間をおいて画面を開き直してください。占いの公開状態は変更されていません。</p>
          </section>
        )}
        <a href={`/s/${serviceSlug}/manage`}>運営者メニューへ戻る</a>
      </main>
    </PublicShell>
  );
}
