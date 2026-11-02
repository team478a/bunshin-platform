'use client';
import { z } from 'zod';
import { useManagedPolicyEditor } from '../../../../ui/use-managed-policy-editor';
import {
  defaultHassyRoadmapSettings,
  normalizeHassyRoadmapSettings,
  hassyRoadmapPolicyViewSchema,
  type HassyRoadmapPolicyView,
} from '../../../../../src/services/hassy-roadmap-settings';
import '../recommendations/policy.css';
const fields = [
  ['generated', '投稿案の生成回数', 1000],
  ['decisions', '投稿案の採用・不採用回数', 1000],
  ['activeDays', '実際に活動した日数（累計）', 365],
  ['validReferrals', '任意の紹介目標（0で表示しない）', 1000],
] as const;
async function parseResponse(response: Response): Promise<HassyRoadmapPolicyView> {
  const result = z
    .object({ data: hassyRoadmapPolicyViewSchema })
    .strict()
    .safeParse(await response.json());
  if (!result.success)
    throw new Error('取得した設定を確認できません。ページを開き直してください。');
  return result.data.data;
}
function Editor({ endpoint, initial }: { endpoint: string; initial: HassyRoadmapPolicyView }) {
  const {
    value,
    authority,
    setAuthority,
    settings,
    setSettings,
    reason,
    setReason,
    message,
    setMessage,
    pending,
    denied,
    canSave,
    read,
    save,
  } = useManagedPolicyEditor({
    endpoint,
    initial,
    defaults: defaultHassyRoadmapSettings,
    normalize: normalizeHassyRoadmapSettings,
    parseResponse,
  });
  if (denied)
    return <p role="alert">設定を表示できません。管理権限を確認し、ページを開き直してください。</p>;
  return (
    <section className="recommendation-policy" aria-label="ロードマップの達成条件">
      <p>
        ハッシーの成長ロードマップに表示する目標です。基本SNS機能の利用条件や特典付与条件は変更しません。
      </p>
      <p>
        現在の版：{value.revision}。本部設定：
        {value.headquarters ? '設定済み' : '未設定（標準条件）'}
      </p>
      <section className="settings-card" aria-label="適用される達成条件">
        <h2>適用される達成条件</h2>
        {fields.map(([key, label]) => (
          <p key={key}>
            {label}：
            {key === 'validReferrals' && value.effective[key] === 0
              ? '表示しない'
              : value.effective[key]}
          </p>
        ))}
      </section>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          void read();
        }}
      >
        最新の設定を取得
      </button>
      {!value.headquarters && !value.permissions.headquarters && (
        <p>本部設定の保存後に、自社の目標を変更できます。</p>
      )}
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <fieldset disabled={pending || denied}>
          <legend>変更する目標</legend>
          {value.permissions.headquarters && (
            <label>
              変更する範囲
              <select
                aria-label="変更する範囲"
                value={authority}
                onChange={(event) => {
                  const next = event.target.value as typeof authority;
                  setAuthority(next);
                  setSettings(
                    next === 'HEADQUARTERS'
                      ? (value.headquarters ?? defaultHassyRoadmapSettings())
                      : value.effective,
                  );
                  setMessage('');
                }}
              >
                <option value="HEADQUARTERS">本部の条件</option>
                <option value="SERVICE">このサービスの条件</option>
              </select>
            </label>
          )}
          {fields.map(([key, label, max]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                type="number"
                required
                min={
                  key === 'validReferrals'
                    ? 0
                    : authority === 'SERVICE'
                      ? (value.headquarters?.[key] ?? 1)
                      : 1
                }
                max={max}
                disabled={
                  key === 'validReferrals' &&
                  authority === 'SERVICE' &&
                  value.headquarters?.validReferrals === 0
                }
                value={settings[key]}
                onChange={(event) =>
                  setSettings({ ...settings, [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
          <p>
            ログインだけの日は活動日数に含みません。紹介目標は任意の進捗で、紹介なしでも基本機能を使えます。
          </p>
          <label>
            変更理由
            <textarea
              aria-label="変更理由"
              required
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </fieldset>
        <button type="submit" disabled={pending || !canSave || !reason.trim()}>
          条件を保存
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <p>
        自社の目標は本部の基準以上に設定できます。紹介目標は本部の許可が必要です。0で表示をやめることもできます。変更後は現在の進捗を再計算します。過去の活動記録・確定済み特典は変更しません。
      </p>
    </section>
  );
}
export function RoadmapPolicyEditor(props: { endpoint: string; initial: HassyRoadmapPolicyView }) {
  return <Editor key={props.endpoint} {...props} />;
}
