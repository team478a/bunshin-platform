import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import {
  fortunePackageAuditHistory,
  fortuneOperationsQuality,
  fortuneOperatorStatus,
} from '../../../../../src/fortune/operator';
import { buildFortuneLaunchSteps } from '../../../../../src/fortune/launch-readiness';
import { buildFortuneOperationalValidation } from '../../../../../src/fortune/operational-validation';
import { fortuneFailureLabel, fortuneRate } from '../../../../../src/fortune/quality';
import { PublicShell } from '../../../../ui/public-shell';
import { FortuneAppearanceEditor } from './fortune-appearance-editor';
import { FortuneGuidanceEditor } from './fortune-guidance-editor';
import { FortuneCommerceProduct } from './commerce-product';
import { FortuneOperatorEditor } from './fortune-operator-editor';

export const dynamic = 'force-dynamic';
const percent = (value: number | null) =>
  value === null ? '集計対象なし' : `${(value * 100).toFixed(1)}%`;

export default async function FortuneManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ commerce?: string }>;
}) {
  const { serviceSlug } = await params;
  const { commerce } = await searchParams;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/fortune`)}`);
  const status = await fortuneOperatorStatus(serviceSlug, actor.userId).catch(() => null);
  if (!status) notFound();
  const [quality, packageHistory] = await Promise.all([
    status.configured
      ? fortuneOperationsQuality(serviceSlug, actor.userId).catch(() => null)
      : Promise.resolve(null),
    fortunePackageAuditHistory(serviceSlug, actor.userId),
  ]);
  const launchSteps = buildFortuneLaunchSteps(serviceSlug, status);
  const completedSteps = launchSteps.filter((step) => step.ready).length;
  const operationalValidation = buildFortuneOperationalValidation(serviceSlug, status, quality);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>占いの公開準備</h1>
          <p>解釈の不足や危険な表現を検査し、すべて揃った後にだけ公開できます。</p>
          <Link href={`/s/${serviceSlug}/manage/fortune/manual` as Route}>
            初めての運営手順を見る
          </Link>
        </header>
        {status.configured && (
          <FortuneCommerceProduct
            serviceSlug={serviceSlug}
            actorUserId={actor.userId}
            {...(commerce ? { result: commerce } : {})}
          />
        )}
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
        <section className="settings-card">
          <h2>パッケージ履歴</h2>
          <p>導入・更新を実行した日時、版、担当者を直近20件まで表示します。</p>
          {packageHistory.length === 0 ? (
            <p>まだ導入・更新履歴はありません。</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>操作</th>
                    <th>版</th>
                    <th>担当者</th>
                  </tr>
                </thead>
                <tbody>
                  {packageHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.occurredAt.toLocaleString('ja-JP')}</td>
                      <td>{entry.action === 'INSTALLED' ? '初回導入' : '更新'}</td>
                      <td>
                        {entry.fromVersion === null
                          ? `v${entry.toVersion}`
                          : `v${entry.fromVersion} → v${entry.toVersion}`}
                      </td>
                      <td>{entry.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          personalProfileEnabled={status.personalProfileEnabled}
          reflectionEnabled={status.reflectionEnabled}
          weeklyNotificationEnabled={status.weeklyNotificationEnabled}
          weeklyNotificationDay={status.weeklyNotificationDay}
          weeklyNotificationHour={status.weeklyNotificationHour}
          timeZone={status.timeZone}
          canEnable={status.canEnable}
          bunshinId={status.bunshinId}
          bunshins={status.bunshins}
        />
        {status.configured && status.guidanceSettings && (
          <>
            <FortuneAppearanceEditor
              serviceSlug={serviceSlug}
              initial={status.guidanceSettings.appearance}
              brand={status.appearanceBrand}
              characters={status.guidanceSettings.characters}
            />
            <FortuneGuidanceEditor serviceSlug={serviceSlug} settings={status.guidanceSettings} />
          </>
        )}
        {status.configured && (
          <section className="settings-card fortune-readiness-card">
            <p className="eyebrow">本番開始後の確認</p>
            <h2>
              利用者の動作確認 {operationalValidation.requiredComplete}/
              {operationalValidation.requiredTotal}
            </h2>
            <p>
              設定が揃っただけでは完了ではありません。運営者とは別のテスト利用者で、登録から結果の確認まで順番に試してください。登録人数は現在値、占い・閲覧・評価は直近
              {quality?.periodDays ?? 30}日の記録で判定します。
            </p>
            <ol className="form-stack">
              {operationalValidation.items.map((item) => (
                <li key={item.key}>
                  <strong className={item.complete ? 'status-success' : 'status-warning'}>
                    {item.complete ? '✓ 確認済み' : item.required ? '未確認' : '推奨'}：{item.title}
                  </strong>
                  <p>{item.description}</p>
                  {!item.complete && <Link href={item.href as Route}>{item.actionLabel}</Link>}
                </li>
              ))}
            </ol>
            <p>
              <strong>
                現在の開始判定：
                {operationalValidation.ready
                  ? '基本動作を確認済みです'
                  : '利用者による確認待ちです'}
              </strong>
            </p>
            {operationalValidation.ready &&
              operationalValidation.recommendedComplete <
                operationalValidation.recommendedTotal && (
                <p>
                  基本動作は確認済みです。結果への評価も1件送ると、運用品質画面まで確認できます。
                </p>
              )}
          </section>
        )}
        {quality?.deepGuidance && (
          <section className="settings-card">
            <h2>深層鑑定の利用状況</h2>
            <p>直近30日（サービスの保存期間が短い場合はその期間内）</p>
            <dl>
              <div>
                <dt>ヒアリング開始</dt>
                <dd>{quality.deepGuidance.starts}件</dd>
              </div>
              <div>
                <dt>相談を確認して鑑定へ進んだ割合</dt>
                <dd>
                  {percent(quality.deepGuidance.completionRate)}（{quality.deepGuidance.reviewed}
                  件）
                </dd>
              </div>
              <div>
                <dt>平均質問数</dt>
                <dd>{quality.deepGuidance.questionAverage?.toFixed(1) ?? '集計対象なし'}</dd>
              </div>
              <div>
                <dt>スキップ・途中終了</dt>
                <dd>
                  {percent(quality.deepGuidance.skipRate)}（スキップ {quality.deepGuidance.skipped}
                  件 / 翌日以降の未完了 {quality.deepGuidance.abandoned}件）
                </dd>
              </div>
              <div>
                <dt>深層鑑定の結果</dt>
                <dd>{quality.deepGuidance.readings}件</dd>
              </div>
              <div>
                <dt>深層鑑定を閲覧した方の別日再訪</dt>
                <dd>
                  {percent(quality.deepGuidance.returnRate)}（{quality.deepGuidance.returnedReaders}
                  人）
                </dd>
              </div>
              <div>
                <dt>自分に合っていたか</dt>
                <dd>
                  とても {quality.deepGuidance.fit.very}件 / ある程度{' '}
                  {quality.deepGuidance.fit.somewhat}件 / あまり {quality.deepGuidance.fit.notMuch}
                  件
                </dd>
              </div>
            </dl>
            <h3>AIの利用と概算原価（{quality.aiOperations.monthKey}、UTC）</h3>
            <dl>
              {(
                [
                  ['ヒアリングの質問選択', quality.deepGuidance.intakeAi],
                  ['深層鑑定の生成', quality.deepGuidance.readingAi],
                ] as const
              ).map(([label, ai]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    成功 {ai.successfulCalls}回 / 失敗 {ai.failedCalls}回（成功率{' '}
                    {percent(fortuneRate(ai.successfulCalls, ai.successfulCalls + ai.failedCalls))}
                    ）
                  </dd>
                  <dd>
                    入力 {ai.inputTokens.toLocaleString('ja-JP')} / 出力{' '}
                    {ai.outputTokens.toLocaleString('ja-JP')} トークン
                  </dd>
                  <dd>
                    {ai.pricedCalls
                      ? `約 $${(ai.estimatedCostUsdMicros / 1_000_000).toFixed(4)} USD`
                      : '原価の記録なし'}
                    {ai.unpricedCalls > 0 && `（価格未設定 ${ai.unpricedCalls}回）`}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
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
                  <dt>AI生成成功率・失敗率</dt>
                  <dd>
                    {percent(
                      fortuneRate(
                        quality.aiOperations.successfulCalls,
                        quality.aiOperations.successfulCalls + quality.aiOperations.failedCalls,
                      ),
                    )}
                    {' / '}
                    {percent(
                      fortuneRate(
                        quality.aiOperations.failedCalls,
                        quality.aiOperations.successfulCalls + quality.aiOperations.failedCalls,
                      ),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>AI利用者1人あたりの概算原価</dt>
                  <dd>
                    {quality.aiOperations.uniqueAiUsers > 0 && quality.aiOperations.pricedCalls > 0
                      ? `約 $${(quality.aiOperations.estimatedCostUsdMicros / quality.aiOperations.uniqueAiUsers / 1_000_000).toFixed(4)} USD`
                      : '集計対象なし'}
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
                {quality.personalGuidance && (
                  <>
                    <div>
                      <dt>初回鑑定完了率（直近30日の新規登録者）</dt>
                      <dd>{percent(quality.personalGuidance.firstCompletionRate)}</dd>
                    </div>
                    <div>
                      <dt>2回目利用率（直近30日の鑑定閲覧者）</dt>
                      <dd>{percent(quality.personalGuidance.secondUseRate)}</dd>
                    </div>
                    <div>
                      <dt>7日以内 / 30日以内の再訪率（鑑定を別日に閲覧）</dt>
                      <dd>
                        {percent(quality.personalGuidance.return7Rate)} /{' '}
                        {percent(quality.personalGuidance.return30Rate)}
                      </dd>
                    </div>
                    <div>
                      <dt>振り返り回答率（完了した鑑定に対する割合）</dt>
                      <dd>{percent(quality.personalGuidance.reflectionRate)}</dd>
                    </div>
                    <div>
                      <dt>提案を試した割合（振り返り回答者の自己申告）</dt>
                      <dd>{percent(quality.personalGuidance.suggestionUseRate)}</dd>
                    </div>
                    <div>
                      <dt>追加質問の利用率（期間中に初めて閲覧した鑑定）</dt>
                      <dd>
                        {percent(quality.personalGuidance.followUpUseRate)}（
                        {quality.personalGuidance.followUpReadings}件）
                      </dd>
                    </div>
                    <div>
                      <dt>自分に合っていたか（任意評価）</dt>
                      <dd>
                        とても {quality.personalGuidance.personalFit.very}件 / ある程度{' '}
                        {quality.personalGuidance.personalFit.somewhat}件 / あまり{' '}
                        {quality.personalGuidance.personalFit.notMuch}件
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>週1回のお知らせを開始した人</dt>
                  <dd>{quality.membershipActivity.notificationOptInParticipants}人</dd>
                </div>
                <div>
                  <dt>週1回のお知らせを停止した人</dt>
                  <dd>{quality.membershipActivity.notificationOptOutParticipants}人</dd>
                </div>
                <div>
                  <dt>週次LINE用リンクから再訪した人</dt>
                  <dd>{quality.membershipActivity.weeklyLineReturnParticipants}人</dd>
                </div>
                <div>
                  <dt>サービスを退会した人</dt>
                  <dd>{quality.membershipActivity.withdrawnParticipants}人</dd>
                </div>
              </dl>
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
