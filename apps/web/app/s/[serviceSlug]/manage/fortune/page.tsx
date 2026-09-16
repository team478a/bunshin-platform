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
        <section className="settings-card">
          <p className="eyebrow">導入情報</p>
          <h2>占いパッケージ</h2>
          <dl>
            <div>
              <dt>サービスに設定された版</dt>
              <dd>
                {status.packageRelease.installedVersion === null
                  ? 'パッケージ情報なし'
                  : `v${status.packageRelease.installedVersion}`}
              </dd>
            </div>
            <div>
              <dt>このシステムの最新版</dt>
              <dd>v{status.packageRelease.currentVersion}</dd>
            </div>
            <div>
              <dt>機能の導入</dt>
              <dd>{status.configured ? '導入済み' : '未導入'}</dd>
            </div>
            <div>
              <dt>更新状態</dt>
              <dd>
                {
                  {
                    CURRENT: '最新版です',
                    UPDATE_AVAILABLE: '更新できます',
                    UNSUPPORTED_NEWER: 'このシステムより新しい版です',
                    NOT_SELECTED: '版情報を確認できません',
                  }[status.packageRelease.state]
                }
              </dd>
            </div>
          </dl>
          {status.packageRelease.state === 'UPDATE_AVAILABLE' && (
            <p>システム管理者がパッケージ更新を適用するまで、現在の設定で運用を続けられます。</p>
          )}
          {status.packageRelease.state === 'UNSUPPORTED_NEWER' && (
            <p className="form-error">
              システムを更新するまで設定を変更せず、システム管理者へ連絡してください。
            </p>
          )}
        </section>
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
            <div>
              <dt>登録参加者</dt>
              <dd>
                {status.registeredParticipants}人
                {status.memberLimit === null ? '（上限なし）' : ` / ${status.memberLimit}人`}
              </dd>
            </div>
            {status.remainingParticipantSlots !== null && (
              <div>
                <dt>残り参加枠</dt>
                <dd>{status.remainingParticipantSlots}人</dd>
              </div>
            )}
          </dl>
          {!status.canEnable && <p>未完了の項目を準備すると、公開ボタンを押せるようになります。</p>}
        </section>
        <FortuneOperatorEditor
          serviceSlug={serviceSlug}
          packageReleaseState={status.packageRelease.state}
          installedPackageVersion={status.packageRelease.installedVersion}
          currentPackageVersion={status.packageRelease.currentVersion}
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
          <>
            <section className="settings-card">
              <p className="eyebrow">{quality.aiOperations.monthKey}</p>
              <h2>今月のAI利用</h2>
              <dl>
                <div>
                  <dt>契約設定</dt>
                  <dd>
                    {{
                      ACTIVE: '利用中',
                      SUSPENDED: '停止中',
                      ENDED: '終了',
                      DRAFT: '準備中（上限は未適用）',
                    }[quality.aiOperations.commercialStatus ?? ''] ?? '設定なし'}
                  </dd>
                </div>
                <div>
                  <dt>サービス全体の利用済み</dt>
                  <dd>
                    {quality.aiOperations.consumedGenerations}回
                    {quality.aiOperations.generationLimit === null
                      ? '（上限なし）'
                      : ` / ${quality.aiOperations.generationLimit}回`}
                  </dd>
                </div>
                <div>
                  <dt>処理中</dt>
                  <dd>{quality.aiOperations.processingGenerations}回</dd>
                </div>
                <div>
                  <dt>AI呼び出し</dt>
                  <dd>
                    成功 {quality.aiOperations.successfulCalls}回 / 失敗{' '}
                    {quality.aiOperations.failedCalls}回
                  </dd>
                </div>
                <div>
                  <dt>使用トークン</dt>
                  <dd>
                    入力 {quality.aiOperations.inputTokens.toLocaleString('ja-JP')} / 出力{' '}
                    {quality.aiOperations.outputTokens.toLocaleString('ja-JP')}
                  </dd>
                </div>
                <div>
                  <dt>概算AI原価</dt>
                  <dd>
                    約 ${(quality.aiOperations.estimatedCostUsdMicros / 1_000_000).toFixed(4)} USD
                  </dd>
                </div>
              </dl>
              {quality.aiOperations.unpricedCalls > 0 && (
                <p>
                  価格未設定の{quality.aiOperations.unpricedCalls}
                  回は概算AI原価に含まれていません。
                </p>
              )}
              <p>
                月間上限は、システム管理者がサービスの契約設定で管理します。成功・失敗とトークン数は、この占い担当が実行したAI生成だけを表示します。
              </p>
            </section>
            <section className="settings-card">
              <p className="eyebrow">直近{quality.periodDays}日</p>
              <h2>登録から継続利用まで</h2>
              <p>
                利用者の氏名や占い内容を表示せず、サービスへの参加と利用の流れだけを確認できます。
              </p>
              <dl>
                <div>
                  <dt>新しく登録した人</dt>
                  <dd>{quality.membershipActivity.registeredParticipants}人</dd>
                </div>
                <div>
                  <dt>初めて利用した人</dt>
                  <dd>{quality.membershipActivity.firstUseParticipants}人</dd>
                </div>
                <div>
                  <dt>別の日にも利用した人</dt>
                  <dd>{quality.membershipActivity.revisitedParticipants}人</dd>
                </div>
                <div>
                  <dt>週1回のお知らせを開始した人</dt>
                  <dd>{quality.membershipActivity.notificationOptInParticipants}人</dd>
                </div>
                <div>
                  <dt>週1回のお知らせを停止した人</dt>
                  <dd>{quality.membershipActivity.notificationOptOutParticipants}人</dd>
                </div>
                <div>
                  <dt>サービスを退会した人</dt>
                  <dd>{quality.membershipActivity.withdrawnParticipants}人</dd>
                </div>
              </dl>
              <p>同じ人が期間中に同じ操作を複数回行っても、この画面では1人として数えます。</p>
            </section>
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
                  <dt>結果を確認した人</dt>
                  <dd>{quality.viewedReaders}人</dd>
                </div>
                <div>
                  <dt>別の日にも利用した人</dt>
                  <dd>{quality.repeatReaders}人</dd>
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
                <div>
                  <dt>評価回答</dt>
                  <dd>{quality.feedbackCount}件</dd>
                </div>
                <div>
                  <dt>参考になった</dt>
                  <dd>{quality.helpfulFeedbackCount}件</dd>
                </div>
                <div>
                  <dt>少し参考になった</dt>
                  <dd>{quality.somewhatFeedbackCount}件</dd>
                </div>
                <div>
                  <dt>今回は違った</dt>
                  <dd>{quality.notHelpfulFeedbackCount}件</dd>
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
              {quality.feedbackIssues.length > 0 && (
                <div>
                  <h3>「今回は違った」と感じた理由</h3>
                  <ul>
                    {quality.feedbackIssues.map((issue) => (
                      <li key={issue.code}>
                        {{
                          TOO_VAGUE: '内容があいまい',
                          HARD_TO_UNDERSTAND: '分かりにくい',
                          UNCOMFORTABLE: '不安になった',
                          OTHER: 'その他',
                        }[issue.code] ?? 'その他'}
                        ：{issue.count}件
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p>この画面には利用者の氏名や占い内容を表示しません。</p>
            </section>
          </>
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
