import { startFourWeekPilot } from './actions';
import type { PointSettingsData } from './points-data';

export function PointsPilotSections({
  data,
  serviceId,
  serviceSlug,
}: {
  data: PointSettingsData;
  serviceId: string;
  serviceSlug: string;
}) {
  const {
    platformAdmin,
    rewardsPilotFeatureKey,
    pilotReadiness,
    configuredFourWeekPilot,
    rewardsPolicyActive,
    rewardsPilotActiveCount,
    policyExpiryNotice,
    configuredPilotPeriodLabel,
    pilotPeriodLabel,
    rewardsPilotMetrics,
    pilotPercentage,
    pilotPeriod,
    memberName,
  } = data;

  return (
    <>
      <section className="settings-card" aria-labelledby="pilot-readiness-title">
        <h2 id="pilot-readiness-title">4週間の試験を始める前の確認</h2>
        {pilotReadiness.status === 'COMPLETED' ? (
          <>
            <p>
              <strong>試験期間は終了しました。</strong>
            </p>
            <p>下にある試験結果を確認し、必要に応じてCSVを保存してください。</p>
            <a className="button button--secondary" href="#pilot-results">
              試験結果を見る
            </a>
          </>
        ) : (
          <>
            <p>
              {pilotReadiness.status === 'READY' ? (
                <strong>準備完了です。試験を開始できます。</strong>
              ) : (
                <strong>あと{pilotReadiness.missingCount}項目の設定が必要です。</strong>
              )}
            </p>
            <p>5項目すべてが「準備済み」になれば、ポイントを安全に試せます。</p>
            <ul>
              {pilotReadiness.items.map((item) => {
                const settingsHref =
                  item.key === 'POLICY' || item.key === 'PERIOD'
                    ? platformAdmin
                      ? `/admin/groups/${serviceId}/features/${rewardsPilotFeatureKey}`
                      : '#pilot-quick-start-title'
                    : item.key === 'PARTICIPANTS'
                      ? `/s/${serviceSlug}/manage/members`
                      : item.key === 'ISSUANCE'
                        ? '#point-control'
                        : '#point-rules';
                return (
                  <li key={item.key}>
                    <strong>
                      {item.ready ? '準備済み' : '要設定'}：{item.label}
                    </strong>
                    <br />
                    <span>{item.detail}</span>
                    {item.key === 'PERIOD' && item.ready ? (
                      <>
                        <br />
                        <span>設定期間：{configuredPilotPeriodLabel ?? pilotPeriodLabel}</span>
                      </>
                    ) : null}
                    {!item.ready && settingsHref ? (
                      <>
                        <br />
                        <a href={settingsHref}>この設定を直す</a>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      <section className="settings-card" aria-labelledby="pilot-quick-start-title">
        <h2 id="pilot-quick-start-title">無料試験をまとめて準備する</h2>
        <p>スマートフォンでは、次の順番で設定すると開始できます。</p>
        <ol>
          <li>今日から4週間の期間を設定します。</li>
          <li>登録と規約への同意を終えた一般参加者は、全員が自動で対象になります。</li>
          <li>上の開始確認がすべて「準備済み」になったら完了です。</li>
        </ol>

        {configuredFourWeekPilot ? (
          <p className="notice notice--success">
            4週間の期間は設定済みです。登録済みの一般参加者
            {rewardsPilotActiveCount}人が全員対象です。
          </p>
        ) : (
          <form action={startFourWeekPilot} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <input
              type="hidden"
              name="reason"
              value="無料のポイント・バッジ試験を今日から4週間実施するため"
            />
            <button className="button button--secondary" type="submit">
              今日から4週間に設定する
            </button>
          </form>
        )}

        <p>
          今後登録する一般参加者も、規約への同意が完了すると自動で対象になります。運営者による選択操作は必要ありません。
        </p>
      </section>
      {policyExpiryNotice ? (
        <section className="settings-card" aria-labelledby="pilot-policy-expiry-title">
          <h2 id="pilot-policy-expiry-title">サービスの試験利用終了日が近づいています</h2>
          <p>
            あと<strong>{policyExpiryNotice.daysRemaining}日</strong>（{policyExpiryNotice.endLabel}
            ）で、このサービスのポイントとバッジが停止します。
          </p>
          {platformAdmin ? (
            <a
              className="button button--secondary"
              href={`/admin/groups/${serviceId}/features/${rewardsPilotFeatureKey}`}
            >
              サービスの終了日を変更する
            </a>
          ) : (
            <p>継続する場合は、システム管理者へ終了日の変更を依頼してください。</p>
          )}
        </section>
      ) : null}
      <section className="settings-card">
        <h2>無料試験の参加者</h2>
        <p>
          現在、登録と規約への同意を終えた一般参加者
          <strong>{rewardsPilotActiveCount}人全員</strong>がポイントとバッジを利用できます。
        </p>
        {rewardsPolicyActive ? (
          <p>新しく登録した一般参加者も自動で追加されます。</p>
        ) : (
          <p>最初にシステム管理者が、このサービスの試験利用を許可してください。</p>
        )}
        <div className="form-actions">
          {!rewardsPolicyActive && platformAdmin ? (
            <a className="button" href={`/admin/groups/${serviceId}/features`}>
              サービスの試験利用を許可する
            </a>
          ) : null}
        </div>
      </section>
      <section className="settings-card" id="pilot-results">
        <h2>試験運用の結果</h2>
        <p>
          {pilotPeriod.status === 'COMPLETED'
            ? '終了した試験期間を固定し、その期間内の結果を表示しています。'
            : pilotPeriod.status === 'UPCOMING'
              ? '試験開始前です。開始後の記録をこの期間へ集計します。'
              : pilotPeriod.status === 'ROLLING'
                ? '試験期間が未設定のため、現在利用中の参加者について直近28日間を集計しています。'
                : '設定された試験期間について、現在までの結果を集計しています。'}
        </p>
        <p>集計期間：{pilotPeriodLabel}</p>
        <div className="table-scroll">
          <table>
            <tbody>
              <tr>
                <th>試験利用者</th>
                <td>{rewardsPilotMetrics.participantCount}人</td>
                <td>集計期間中にポイントとバッジを利用できた人数</td>
              </tr>
              <tr>
                <th>投稿した人</th>
                <td>
                  {rewardsPilotMetrics.postingUserCount}人（
                  {pilotPercentage(rewardsPilotMetrics.postingUserCount)}）
                </td>
                <td>「投稿しました」を1回以上記録した人</td>
              </tr>
              <tr>
                <th>3日以上続けた人</th>
                <td>
                  {rewardsPilotMetrics.continuedUserCount}人（
                  {pilotPercentage(rewardsPilotMetrics.continuedUserCount)}）
                </td>
                <td>別々の日に3回以上、投稿完了を記録した人</td>
              </tr>
              <tr>
                <th>ポイントを使った人</th>
                <td>
                  {rewardsPilotMetrics.redemptionUserCount}人（
                  {pilotPercentage(rewardsPilotMetrics.redemptionUserCount)}）
                </td>
                <td>ポイント交換を1回以上行った人</td>
              </tr>
              <tr>
                <th>期間中の記録</th>
                <td>{rewardsPilotMetrics.postCount}投稿</td>
                <td>
                  付与 {rewardsPilotMetrics.grantedPoints}WP／利用{' '}
                  {rewardsPilotMetrics.consumedPoints}WP
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <a
          className="button button--secondary"
          href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=pilot`}
        >
          4週間の試験結果を保存
        </a>

        <h3>確認候補</h3>
        {rewardsPilotMetrics.reviewCandidates.length === 0 ? (
          <p>現在、確認が必要な記録はありません。</p>
        ) : (
          <ul>
            {rewardsPilotMetrics.reviewCandidates.map((candidate) => (
              <li key={candidate.userId}>
                <strong>{memberName.get(candidate.userId) ?? '参加者'}</strong>：
                {candidate.reasons.join('、')}
              </li>
            ))}
          </ul>
        )}
        <p>
          <small>
            1日に5件以上、または10分以内に3件以上の投稿完了がある場合に表示します。自動判定は不正を断定するものではありません。入力間違いや操作状況を確認してください。
          </small>
        </p>
      </section>
    </>
  );
}
