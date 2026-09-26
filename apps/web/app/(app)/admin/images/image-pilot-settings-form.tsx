import { saveImagePilot } from './image-pilot-actions';

type PilotSettings = {
  dailyLimit: number;
  monthlyLimit: number;
  memberMonthlyLimit: number;
  defaultModel: string;
  defaultQuality: string;
  startsAt: Date | null;
  endsAt: Date | null;
  emergencyStop: boolean;
} | null;

type PilotMember = {
  id: string;
  consentedAt: Date | null;
  user: { displayName: string; email: string | null };
  featureAssignments: { id: string }[];
};

const dateTimeValue = (value: Date | null | undefined) =>
  value
    ? value
        .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
        .replace(' ', 'T')
        .slice(0, 16)
    : '';

export function ImagePilotSettingsForm({
  workspaceId,
  groupId,
  pilot,
  members,
  enrolled,
  canEdit,
}: {
  workspaceId: string;
  groupId: string;
  pilot: PilotSettings;
  members: PilotMember[];
  enrolled: Set<string>;
  canEdit: boolean;
}) {
  return (
    <section className="settings-card">
      <h2>試験設定を更新</h2>
      <p>保存すると新しい設定版を作り、古い版を終了します。最高管理者だけが変更できます。</p>
      {canEdit ? (
        <form className="form-stack" action={saveImagePilot}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="groupId" value={groupId} />
          <label className="field">
            <span className="field__label">1日のグループ上限</span>
            <input
              className="field__control"
              type="number"
              name="dailyLimit"
              min="1"
              required
              defaultValue={pilot?.dailyLimit ?? 10}
            />
          </label>
          <label className="field">
            <span className="field__label">1か月のグループ上限</span>
            <input
              className="field__control"
              type="number"
              name="monthlyLimit"
              min="1"
              required
              defaultValue={pilot?.monthlyLimit ?? 100}
            />
          </label>
          <label className="field">
            <span className="field__label">参加者1人の月間上限</span>
            <input
              className="field__control"
              type="number"
              name="memberMonthlyLimit"
              min="1"
              required
              defaultValue={pilot?.memberMonthlyLimit ?? 20}
            />
          </label>
          <label className="field">
            <span className="field__label">画像モデル</span>
            <input
              className="field__control"
              name="defaultModel"
              required
              defaultValue={pilot?.defaultModel ?? 'gpt-image-1'}
            />
          </label>
          <label className="field">
            <span className="field__label">品質</span>
            <select
              className="field__control"
              name="defaultQuality"
              defaultValue={pilot?.defaultQuality ?? 'low'}
            >
              <option value="low">低（試験向け・安価）</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">開始日時（空欄ならすぐ）</span>
            <input
              className="field__control"
              type="datetime-local"
              name="startsAt"
              defaultValue={dateTimeValue(pilot?.startsAt)}
            />
          </label>
          <label className="field">
            <span className="field__label">終了日時（空欄なら期限なし）</span>
            <input
              className="field__control"
              type="datetime-local"
              name="endsAt"
              defaultValue={dateTimeValue(pilot?.endsAt)}
            />
          </label>
          <label className="field">
            <span className="field__label">運転状態</span>
            <select
              className="field__control"
              name="emergencyStop"
              defaultValue={pilot?.emergencyStop ? 'true' : 'false'}
            >
              <option value="false">利用する</option>
              <option value="true">すぐに全員を停止する</option>
            </select>
          </label>
          <fieldset>
            <legend>試験に参加する人</legend>
            {members.map((member) => {
              const eligible = Boolean(member.consentedAt && member.featureAssignments.length);
              return (
                <label key={member.id} style={{ display: 'block', marginBlock: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="memberId"
                    value={member.id}
                    defaultChecked={enrolled.has(member.id)}
                    disabled={!eligible}
                  />{' '}
                  {member.user.displayName}（{member.user.email}）
                  {eligible ? '' : '―参加同意または機能設定が必要'}
                </label>
              );
            })}
          </fieldset>
          <label className="field">
            <span className="field__label">変更理由</span>
            <textarea
              className="field__control"
              name="changeReason"
              required
              minLength={5}
              placeholder="例：社内テストを10人で開始するため"
            />
          </label>
          <button className="button" type="submit">
            新しい設定版として保存
          </button>
        </form>
      ) : (
        <p>この画面では確認だけできます。変更は最高管理者が行います。</p>
      )}
    </section>
  );
}
