import { saveMemberFeatureAssignment } from './actions';
import type { GroupMembersPageModel } from './group-members-data';

function localDateTime(value: Date | null): string {
  if (!value) return '';
  return value
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

const statusLabel = { ENABLED: '利用できる', DISABLED: '利用できない' } as const;

type GroupMemberFeatureSettingsModel = Pick<
  GroupMembersPageModel,
  | 'group'
  | 'query'
  | 'selectedMember'
  | 'rewardsPilotCount'
  | 'assignments'
  | 'selectedUsage'
  | 'localDate'
>;

export function GroupMemberFeatureSettings({ model }: { model: GroupMemberFeatureSettingsModel }) {
  const { group, query, selectedMember, rewardsPilotCount, assignments, selectedUsage, localDate } =
    model;
  return (
    <>
      {selectedMember && group.featurePolicies.length === 0 ? (
        <section className="settings-card">
          <h2>設定できる機能がありません</h2>
          <p>システム管理者が、このグループで使える機能を許可すると表示されます。</p>
        </section>
      ) : null}

      <div id="member-features">
        {selectedMember
          ? group.featurePolicies.map((policy) => {
              const assignment = assignments.get(policy.featureKey);
              const usage = selectedUsage.filter((event) => event.featureKey === policy.featureKey);
              return (
                <section className="settings-card" key={policy.id}>
                  <h2>{policy.feature.name}</h2>
                  <p>{policy.feature.description}</p>
                  {policy.featureKey === 'REWARDS.POINTS_BADGES' ? (
                    <p>
                      登録と規約への同意を終えた一般参加者
                      <strong>{rewardsPilotCount}人全員</strong>が自動で利用できます。
                    </p>
                  ) : null}
                  <p>
                    グループ上限：1日 {policy.dailyLimit ?? '上限なし'} ／ 1か月{' '}
                    {policy.monthlyLimit ?? '上限なし'}
                  </p>
                  <p>
                    利用回数：今日 {usage.filter((event) => event.localDate === localDate).length}回
                    ／ 今月 {usage.length}回
                  </p>
                  <p>
                    この参加者：
                    <strong>
                      {policy.featureKey === 'REWARDS.POINTS_BADGES'
                        ? selectedMember.serviceRole === 'PARTICIPANT' && selectedMember.consentedAt
                          ? '登録済み（自動で利用できる）'
                          : '対象外（一般参加者の登録と規約同意が必要）'
                        : assignment
                          ? statusLabel[assignment.status]
                          : '未設定（利用できない）'}
                    </strong>
                  </p>
                  {query.service && policy.featureKey !== 'REWARDS.POINTS_BADGES' ? (
                    <p>
                      運営者は、システム管理者がこのサービスに許可した範囲で、参加者ごとの利用可否を変更できます。
                    </p>
                  ) : null}
                  {policy.featureKey === 'REWARDS.POINTS_BADGES' ? (
                    <p>
                      個別の利用許可は必要ありません。参加を停止するとポイントとバッジも自動で利用できなくなります。
                    </p>
                  ) : (
                    <form className="form-stack" action={saveMemberFeatureAssignment}>
                      {query.service && (
                        <input type="hidden" name="serviceSlug" value={query.service} />
                      )}
                      <input type="hidden" name="workspaceId" value={group.workspaceId} />
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="groupMembershipId" value={selectedMember.id} />
                      <input type="hidden" name="featureKey" value={policy.featureKey} />
                      <label className="field">
                        <span className="field__label">この参加者が</span>
                        <select
                          className="field__control"
                          name="status"
                          defaultValue={assignment?.status ?? 'DISABLED'}
                        >
                          <option value="ENABLED">利用できる</option>
                          <option value="DISABLED">利用できない</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="field__label">
                          1日の上限（空欄ならグループ上限と同じ）
                        </span>
                        <input
                          className="field__control"
                          name="dailyLimit"
                          type="number"
                          min="1"
                          max={policy.dailyLimit ?? 1_000_000}
                          defaultValue={assignment?.dailyLimit ?? ''}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">
                          1か月の上限（空欄ならグループ上限と同じ）
                        </span>
                        <input
                          className="field__control"
                          name="monthlyLimit"
                          type="number"
                          min="1"
                          max={policy.monthlyLimit ?? 1_000_000}
                          defaultValue={assignment?.monthlyLimit ?? ''}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">利用開始日時（空欄なら今から）</span>
                        <input
                          className="field__control"
                          name="startsAt"
                          type="datetime-local"
                          defaultValue={localDateTime(assignment?.startsAt ?? null)}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">利用終了日時（空欄なら期限なし）</span>
                        <input
                          className="field__control"
                          name="endsAt"
                          type="datetime-local"
                          defaultValue={localDateTime(assignment?.endsAt ?? null)}
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">変更理由</span>
                        <textarea
                          className="field__control"
                          name="reason"
                          required
                          minLength={5}
                          maxLength={1000}
                          placeholder="例：画像作成を担当してもらうため"
                        />
                      </label>
                      <div className="form-actions">
                        <button className="button" type="submit" name="status" value="ENABLED">
                          この参加者に利用を許可する
                        </button>
                        <button
                          className="button button--secondary"
                          type="submit"
                          name="status"
                          value="DISABLED"
                        >
                          この参加者の利用を停止する
                        </button>
                        <button className="button button--secondary" type="submit">
                          上限などを保存する
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              );
            })
          : null}
      </div>
    </>
  );
}
