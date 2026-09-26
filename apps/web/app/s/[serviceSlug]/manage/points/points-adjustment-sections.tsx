import { randomUUID } from 'node:crypto';

import { cancelRecovery, correctPoints, grantBonus } from './actions';
import type { PointSettingsData } from './points-data';

export function PointsAdjustmentSections({
  data,
  serviceSlug,
}: {
  data: PointSettingsData;
  serviceSlug: string;
}) {
  const {
    pointConfiguration,
    bonusRecipients,
    memberships,
    pointAccountByUser,
    cancellableRecoveries,
    history,
    memberName,
  } = data;

  return (
    <>
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
