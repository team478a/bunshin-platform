import { randomUUID } from 'node:crypto';

import {
  REWARDS,
  RULES,
  cancelRecovery,
  changePointIssuance,
  correctPoints,
  grantBonus,
  redemptionStatusLabels,
  saveCampaignRules,
  saveRewardSettings,
  saveRules,
} from './actions';
import type { PointSettingsData } from './points-data';

export function PointsOperationsSections({
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
    current,
    campaigns,
    currentRewardSettings,
    globalRewardDefaults,
    bonusRecipients,
    cancellableRecoveries,
    history,
    memberName,
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
      <section className="settings-card" id="point-rules">
        <h2>ポイントのため方を設定</h2>
        <p>チェックを外すと、その条件からはポイントが付かなくなります。変更前の履歴も残ります。</p>
        <form action={saveRules} className="form-stack">
          <input type="hidden" name="serviceSlug" value={serviceSlug} />
          {RULES.map((rule) => {
            const saved = current.get(rule.key);
            return (
              <fieldset className="settings-card" key={rule.key}>
                <legend>
                  <strong>{rule.label}</strong>
                </legend>
                <label className="field">
                  <span className="field__label">利用する</span>
                  <input
                    name={`enabled_${rule.key}`}
                    type="checkbox"
                    defaultChecked={!saved || saved.status === 'ACTIVE'}
                  />
                </label>
                <label className="field">
                  <span className="field__label">もらえるポイント</span>
                  <input
                    className="field__control"
                    name={rule.key}
                    type="number"
                    min="1"
                    max="10000"
                    defaultValue={saved?.grantAmount ?? rule.defaultAmount}
                    required
                  />
                </label>
                <small>{rule.help}</small>
                <label className="field">
                  <span className="field__label">この設定で発行できる合計上限</span>
                  <input
                    className="field__control"
                    name={rule.budgetKey}
                    type="number"
                    min="1"
                    max="10000000"
                    defaultValue={saved?.budget?.maximumPoints ?? ''}
                    placeholder="空欄なら上限なし"
                  />
                </label>
                {saved?.budget ? (
                  <small>
                    現在 {saved.budget.grantedPoints.toLocaleString('ja-JP')} WP発行済み／残り
                    {(saved.budget.maximumPoints - saved.budget.grantedPoints).toLocaleString(
                      'ja-JP',
                    )}{' '}
                    WP
                  </small>
                ) : (
                  <small>上限なしで発行します。</small>
                )}
              </fieldset>
            );
          })}
          <label className="field">
            <span className="field__label">変更理由</span>
            <textarea
              className="field__control"
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          </label>
          <button className="button" type="submit">
            ポイント設定を保存
          </button>
        </form>
      </section>
      <section className="settings-card" id="campaign-point-rules">
        <h2>募集ごとのポイントを設定</h2>
        <p>
          特定の募集だけポイント数を変えられます。「サービス設定を使う」を選ぶと、上の通常設定に戻ります。
        </p>
        {campaigns.length === 0 ? (
          <>
            <p>設定できる募集中・準備中の企画はありません。</p>
            <a className="button button--secondary" href={`/s/${serviceSlug}/manage/campaigns`}>
              参加募集を確認
            </a>
          </>
        ) : (
          <div className="form-stack">
            {campaigns.map((campaign) => (
              <form
                action={saveCampaignRules}
                className="settings-card form-stack"
                key={campaign.id}
              >
                <input type="hidden" name="serviceSlug" value={serviceSlug} />
                <input type="hidden" name="campaignId" value={campaign.id} />
                <h3>{campaign.name}</h3>
                <p>
                  {campaign.status === 'OPEN' ? '募集中' : '準備中'}／
                  {campaign.startsAt.toLocaleDateString('ja-JP')}〜
                  {campaign.endsAt.toLocaleDateString('ja-JP')}
                </p>
                {RULES.map((rule) => {
                  const saved = campaign.pointRuleVersions.find(
                    (version) => version.ruleKey === rule.key,
                  );
                  const serviceRule = current.get(rule.key);
                  return (
                    <fieldset key={rule.key}>
                      <legend>
                        <strong>{rule.label}</strong>
                      </legend>
                      <label className="field">
                        <span className="field__label">この募集での設定</span>
                        <select
                          className="field__control"
                          name={`mode_${rule.key}`}
                          defaultValue={saved?.status ?? 'INHERIT'}
                        >
                          <option value="INHERIT">サービス設定を使う</option>
                          <option value="ACTIVE">この募集専用のポイント数にする</option>
                          <option value="SUSPENDED">この募集では付与しない</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field__label">この募集でもらえるポイント</span>
                        <input
                          className="field__control"
                          name={rule.key}
                          type="number"
                          min="1"
                          max="10000"
                          defaultValue={
                            saved?.grantAmount ?? serviceRule?.grantAmount ?? rule.defaultAmount
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">この募集で発行できる合計上限</span>
                        <input
                          className="field__control"
                          name={rule.budgetKey}
                          type="number"
                          min="1"
                          max="10000000"
                          defaultValue={saved?.budget?.maximumPoints ?? ''}
                          placeholder="専用設定時のみ。空欄なら上限なし"
                        />
                      </label>
                      {saved?.budget ? (
                        <small>
                          現在 {saved.budget.grantedPoints.toLocaleString('ja-JP')} WP発行済み／残り
                          {(saved.budget.maximumPoints - saved.budget.grantedPoints).toLocaleString(
                            'ja-JP',
                          )}{' '}
                          WP
                        </small>
                      ) : null}
                    </fieldset>
                  );
                })}
                <label className="field">
                  <span className="field__label">変更理由</span>
                  <textarea
                    className="field__control"
                    name="reason"
                    minLength={3}
                    maxLength={1000}
                    required
                  />
                </label>
                <button className="button" type="submit">
                  この募集の設定を保存
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
      <section className="settings-card" id="point-rewards">
        <h2>ポイントの使い道を設定</h2>
        <p>
          チェックを外すと、参加者の画面から消え、新しい交換もできなくなります。すでに完了した交換の履歴は残ります。
        </p>
        <form action={saveRewardSettings} className="form-stack">
          <input type="hidden" name="serviceSlug" value={serviceSlug} />
          {REWARDS.map((reward) => {
            const saved = currentRewardSettings.get(reward.type);
            return (
              <fieldset className="settings-card" key={reward.type}>
                <legend>
                  <strong>{reward.label}</strong>
                </legend>
                <label className="field">
                  <span className="field__label">利用する</span>
                  <input
                    name={`enabled_${reward.type}`}
                    type="checkbox"
                    defaultChecked={!saved || saved.status === 'ACTIVE'}
                  />
                </label>
                <label className="field">
                  <span className="field__label">必要なポイント</span>
                  <input
                    className="field__control"
                    name={reward.type}
                    type="number"
                    min="1"
                    max="10000"
                    defaultValue={
                      saved?.pointCost ??
                      globalRewardDefaults.get(reward.type) ??
                      reward.defaultCost
                    }
                    required
                  />
                </label>
                <small>{reward.help}</small>
              </fieldset>
            );
          })}
          <label className="field">
            <span className="field__label">変更理由</span>
            <textarea
              className="field__control"
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          </label>
          <button className="button" type="submit">
            使い道の設定を保存
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>参加者へボーナスを付与</h2>
        <p>イベントやお礼など、運営判断でポイントを追加できます。理由と実行者を記録します。</p>
        <p>運営者自身への付与はできません。</p>
        {bonusRecipients.length === 0 ? (
          <p>付与できる参加者はまだいません。</p>
        ) : (
          <form action={grantBonus} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <input type="hidden" name="operationId" value={randomUUID()} />
            <label className="field">
              <span className="field__label">参加者</span>
              <select className="field__control" name="userId" required>
                {bonusRecipients.map((membership) => (
                  <option key={membership.userId} value={membership.userId}>
                    {membership.user.displayName || membership.user.email || membership.userId}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">追加するポイント</span>
              <input
                className="field__control"
                name="amount"
                type="number"
                min="1"
                max="10000"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">付与する理由</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button
              className="button"
              type="submit"
              disabled={pointConfiguration.pointIssuanceStopped}
            >
              {pointConfiguration.pointIssuanceStopped ? '一括停止中' : 'ボーナスを付与'}
            </button>
          </form>
        )}
      </section>
      <section className="settings-card" id="point-recovery">
        <h2>誤付与ポイントを回収</h2>
        <p>
          誤って付与した合計額を入力します。残高で足りない分は「回収未済」として残り、解消するまでポイント交換を停止します。
        </p>
        <p>その後にもらうポイントは、回収未済分へ自動で充てられます。</p>
        <form action={correctPoints} className="form-stack">
          <input type="hidden" name="serviceSlug" value={serviceSlug} />
          <input type="hidden" name="operationId" value={randomUUID()} />
          <label className="field">
            <span className="field__label">参加者</span>
            <select className="field__control" name="userId" required>
              {memberships.map((membership) => (
                <option key={membership.userId} value={membership.userId}>
                  {membership.user.displayName || membership.user.email || membership.userId}
                  （現在
                  {pointAccountByUser.get(membership.userId)?.availablePoints ?? 0} WP／回収未済
                  {pointAccountByUser.get(membership.userId)?.recoveryDue ?? 0} WP）
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">誤って付与したポイント</span>
            <input
              className="field__control"
              name="amount"
              type="number"
              min="1"
              max="10000"
              required
            />
          </label>
          <label className="field">
            <span className="field__label">回収する理由（本人にも表示されます）</span>
            <textarea
              className="field__control"
              name="reason"
              minLength={3}
              maxLength={1000}
              required
            />
          </label>
          <button className="button button--secondary" type="submit">
            回収を記録
          </button>
        </form>
      </section>
      <section className="settings-card" id="point-recovery-cancellation">
        <h2>回収を取り消す</h2>
        <p>
          回収する相手や金額を間違えた場合に使います。回収済みのポイントは本人へ戻り、回収未済分も解除されます。
        </p>
        {cancellableRecoveries.length === 0 ? (
          <p>取り消せる回収記録はありません。</p>
        ) : (
          <form action={cancelRecovery} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <input type="hidden" name="operationId" value={randomUUID()} />
            <label className="field">
              <span className="field__label">取り消す回収記録</span>
              <select className="field__control" name="recoveryTransactionId" required>
                {cancellableRecoveries.map((recovery) => {
                  const recovered = recovery.consumptionFor.reduce(
                    (sum, link) => sum + link.amount,
                    0,
                  );
                  return (
                    <option key={recovery.id} value={recovery.id}>
                      {recovery.user.displayName || recovery.user.email || recovery.userId}／
                      {Math.abs(recovery.amount)} WP／回収済み{recovered} WP／
                      {recovery.createdAt.toLocaleDateString('ja-JP')}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              <span className="field__label">取り消す理由（本人にも表示されます）</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button className="button button--secondary" type="submit">
              この回収を取り消す
            </button>
          </form>
        )}
      </section>
      <section className="settings-card">
        <h2>バッジを設定・付与</h2>
        <p>このサービス専用のバッジを作り、参加者を選んで付与できます。</p>
        <a className="button button--secondary" href={`/s/${serviceSlug}/manage/badges`}>
          バッジ管理を開く
        </a>
      </section>
      <section className="settings-card">
        <h2>最近の変更履歴</h2>
        {history.length === 0 ? (
          <p>まだ変更はありません。</p>
        ) : (
          <ul>
            {history.map((item) => {
              const data =
                item.afterData &&
                typeof item.afterData === 'object' &&
                !Array.isArray(item.afterData)
                  ? (item.afterData as Record<string, unknown>)
                  : {};
              const target = typeof data.userId === 'string' ? memberName.get(data.userId) : null;
              const amount = typeof data.amount === 'number' ? data.amount : '';
              return (
                <li key={item.id}>
                  <strong>
                    {item.action === 'POINT_RULES_UPDATED'
                      ? '獲得条件を変更'
                      : item.action === 'CAMPAIGN_POINT_RULES_UPDATED'
                        ? `${typeof data.campaignName === 'string' ? data.campaignName : '募集'}のポイント条件を変更`
                        : item.action === 'POINT_REWARDS_UPDATED'
                          ? 'ポイントの使い道を変更'
                          : item.action === 'POINT_ISSUANCE_STOPPED'
                            ? 'ポイント付与を一括停止'
                            : item.action === 'POINT_ISSUANCE_RESUMED'
                              ? 'ポイント付与を再開'
                              : item.action === 'POINT_BALANCE_CORRECTED'
                                ? `${target ?? '参加者'}のポイントを ${Math.abs(Number(amount))} WP訂正`
                                : item.action === 'POINT_RECOVERY_REGISTERED'
                                  ? `${target ?? '参加者'}から ${Math.abs(Number(amount))} WP回収`
                                  : item.action === 'POINT_RECOVERY_CANCELLED'
                                    ? `${target ?? '参加者'}の回収 ${Math.abs(Number(amount))} WPを取消`
                                    : `${target ?? '参加者'}へ ${amount} WP付与`}
                  </strong>
                  <br />
                  {item.occurredAt.toLocaleString('ja-JP')}／
                  {item.performedBy.displayName || item.performedBy.email || '運営者'}／
                  {item.reason}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
