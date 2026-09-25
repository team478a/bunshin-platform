import { changePointIssuance } from './actions';
import { redemptionStatusLabels } from './point-definitions';
import type { PointSettingsData } from './points-data';

export function PointsOverviewSections({
  data,
  serviceSlug,
}: {
  data: PointSettingsData;
  serviceSlug: string;
}) {
  const {
    pointConfiguration,
    recentRedemptions,
    memberships,
    pointAccountByUser,
    pointChangeByUser,
    badgeCountByUser,
    latestActivityByUser,
  } = data;

  return (
    <>
      <section className="settings-card" id="point-control">
        <h2>ポイント付与の一括停止</h2>
        <p>
          現在は
          <strong>{pointConfiguration.pointIssuanceStopped ? '停止中' : '稼働中'}</strong>
          です。停止中は、行動による自動付与と運営者ボーナスが新しく発行されません。
        </p>
        <p>残高確認、履歴、訂正、失効や返却は継続します。</p>
        <form action={changePointIssuance} className="form-stack">
          <input type="hidden" name="serviceSlug" value={serviceSlug} />
          <input
            type="hidden"
            name="target"
            value={pointConfiguration.pointIssuanceStopped ? 'resume' : 'stop'}
          />
          <label className="field">
            <span className="field__label">
              {pointConfiguration.pointIssuanceStopped ? '再開する理由' : '停止する理由'}
            </span>
            <textarea
              className="field__control"
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          </label>
          <button
            className={`button${pointConfiguration.pointIssuanceStopped ? '' : ' button--secondary'}`}
            type="submit"
          >
            {pointConfiguration.pointIssuanceStopped
              ? 'ポイント付与を再開'
              : 'ポイント付与を一括停止'}
          </button>
        </form>
      </section>
      <section className="settings-card" id="redemption-history">
        <h2>最近のポイント交換</h2>
        <p>誰が、何に、何WPを使ったかを確認できます。失敗して返却された処理も残ります。</p>
        {recentRedemptions.length === 0 ? (
          <p>ポイント交換の履歴はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>参加者</th>
                  <th>交換内容</th>
                  <th>使用WP</th>
                  <th>状態</th>
                  <th>日時</th>
                </tr>
              </thead>
              <tbody>
                {recentRedemptions.map((redemption) => (
                  <tr key={redemption.id}>
                    <td>{redemption.user.displayName || redemption.user.email || '参加者'}</td>
                    <td>{redemption.catalogItem.title}</td>
                    <td>{redemption.pointCost.toLocaleString('ja-JP')} WP</td>
                    <td>{redemptionStatusLabels[redemption.status]}</td>
                    <td>
                      {(redemption.confirmedAt ?? redemption.createdAt).toLocaleString('ja-JP')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="settings-card">
        <h2>参加者のポイント・バッジ状況</h2>
        <p>
          現在のWPは、この参加者が同じワークスペースで使える共通残高です。「サービス内の増減」とバッジは、このサービスの活動だけを表示します。
        </p>
        <p>運用記録はCSVで保存できます。ExcelやGoogleスプレッドシートで開けます。</p>
        <div className="button-row">
          <a
            className="button button--secondary"
            href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=summary`}
          >
            参加者一覧を保存
          </a>
          <a
            className="button button--secondary"
            href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=points`}
          >
            ポイント履歴を保存
          </a>
          <a
            className="button button--secondary"
            href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=badges`}
          >
            バッジ履歴を保存
          </a>
          <a
            className="button button--secondary"
            href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=audit`}
          >
            運営操作履歴を保存
          </a>
        </div>
        {memberships.length === 0 ? (
          <p>参加者はまだいません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>参加者</th>
                  <th>現在のWP</th>
                  <th>回収未済</th>
                  <th>サービス内の増減</th>
                  <th>獲得バッジ</th>
                  <th>最終更新</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => {
                  const account = pointAccountByUser.get(membership.userId);
                  const change = pointChangeByUser.get(membership.userId) ?? 0;
                  const latest = latestActivityByUser.get(membership.userId);
                  return (
                    <tr key={membership.userId}>
                      <td>
                        <strong>
                          {membership.user.displayName ||
                            membership.user.email ||
                            membership.userId}
                        </strong>
                        <br />
                        <small>
                          {membership.serviceRole === 'SERVICE_OWNER'
                            ? 'サービス所有者'
                            : membership.serviceRole === 'SERVICE_ADMIN'
                              ? '運営管理者'
                              : membership.serviceRole === 'CONTENT_EDITOR'
                                ? 'コンテンツ担当者'
                                : '参加者'}
                        </small>
                      </td>
                      <td>{(account?.availablePoints ?? 0).toLocaleString('ja-JP')} WP</td>
                      <td>
                        {account?.recoveryDue ? (
                          <strong className="status-warning">
                            {account.recoveryDue.toLocaleString('ja-JP')} WP
                          </strong>
                        ) : (
                          'なし'
                        )}
                      </td>
                      <td>
                        {change > 0 ? '+' : ''}
                        {change.toLocaleString('ja-JP')} WP
                      </td>
                      <td>{badgeCountByUser.get(membership.userId) ?? 0}個</td>
                      <td>{latest ? latest.toLocaleString('ja-JP') : 'まだありません'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
