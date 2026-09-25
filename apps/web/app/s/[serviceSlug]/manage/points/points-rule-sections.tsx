import { saveCampaignRules, saveRewardSettings, saveRules } from './actions';
import { REWARDS, RULES } from './point-definitions';
import type { PointSettingsData } from './points-data';

export function PointsRuleSections({
  data,
  serviceSlug,
}: {
  data: PointSettingsData;
  serviceSlug: string;
}) {
  const { current, campaigns, currentRewardSettings, globalRewardDefaults } = data;

  return (
    <>
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
    </>
  );
}
