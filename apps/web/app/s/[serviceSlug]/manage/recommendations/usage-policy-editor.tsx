'use client';
import { z } from 'zod';
import {
  defaultSocialUsageGuidanceSettings,
  normalizeSocialUsageGuidanceSettings,
  type SocialUsageGuidanceView,
} from '@bunshin/capability-social';
import { useManagedPolicyEditor } from '../../../../ui/use-managed-policy-editor';
import './policy.css';
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    imageMinimum: z.number().int().min(5).max(1000),
    platformMinimum: z.number().int().min(2).max(10),
    referralMinimum: z.number().int().min(3).max(1000),
    questionIntervalDays: z.number().int().min(2).max(90),
  })
  .strict();
const viewSchema = z
  .object({
    version: z.literal('social-usage-guidance-policy-v1'),
    revision: z.number().int().min(0).max(2_147_483_646),
    headquarters: settingsSchema.nullable(),
    service: settingsSchema.nullable(),
    effective: settingsSchema,
    permissions: z.object({ headquarters: z.boolean(), service: z.boolean() }).strict(),
  })
  .strict();
async function parseResponse(response: Response): Promise<SocialUsageGuidanceView> {
  const value = z
    .object({ data: viewSchema })
    .strict()
    .safeParse(await response.json());
  if (!value.success) throw new Error('取得した設定を確認できません。');
  return value.data.data;
}
const fields = [
  ['imageMinimum', '画像作成成功の依頼数', 5, 1000],
  ['platformMinimum', '利用したSNSの種類数', 2, 10],
  ['referralMinimum', '確定済みの紹介数', 3, 1000],
  ['questionIntervalDays', '未回答の質問を再表示する間隔（日）', 2, 90],
] as const;
function Editor({ endpoint, initial }: { endpoint: string; initial: SocialUsageGuidanceView }) {
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
    defaults: defaultSocialUsageGuidanceSettings,
    normalize: normalizeSocialUsageGuidanceSettings,
    parseResponse,
  });
  if (denied)
    return <p role="alert">設定を表示できません。管理権限を確認し、ページを開き直してください。</p>;
  return (
    <section className="recommendation-policy" aria-label="利用実績に応じた案内の設定">
      <h2>利用実績に応じた案内</h2>
      <p>
        画像の利用枠・複数SNSの手動準備・紹介状況の無料ガイドです。外部接続や特典の自動付与は行いません。既存の提案対象・機能権限も適用されます。
      </p>
      <p>
        現在の版：{value.revision}。本部設定：
        {value.headquarters ? '設定済み' : '未設定（標準条件）'}
      </p>
      <section className="settings-card" aria-label="適用される利用案内条件">
        <p>
          {value.effective.enabled ? '利用実績に応じた案内を許可' : '利用実績に応じた案内を停止'}
        </p>
        {fields.map(([key, label]) => (
          <p key={key}>
            {label}：{value.effective[key]}
          </p>
        ))}
      </section>
      <p>
        画像とSNSは直近28日、紹介は累計です。未回答質問の間隔は、既存の困りごと確認にも適用します。実際に見えた質問だけが対象です。
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          void read();
        }}
      >
        利用案内の最新設定を取得
      </button>
      {!value.headquarters && !value.permissions.headquarters && (
        <p>本部設定の保存後に自社条件を変更できます。</p>
      )}
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <fieldset disabled={pending}>
          <legend>利用案内の条件</legend>
          {value.permissions.headquarters && (
            <label>
              変更する範囲
              <select
                aria-label="利用案内の変更範囲"
                value={authority}
                onChange={(event) => {
                  const next = event.target.value as typeof authority;
                  setAuthority(next);
                  setSettings(
                    next === 'HEADQUARTERS'
                      ? (value.headquarters ?? defaultSocialUsageGuidanceSettings())
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
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={authority === 'SERVICE' && value.headquarters?.enabled === false}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
            />
            利用実績に応じた案内を有効にする
          </label>
          {fields.map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                type="number"
                required
                min={authority === 'SERVICE' ? (value.headquarters?.[key] ?? min) : min}
                max={max}
                value={settings[key]}
                onChange={(event) =>
                  setSettings({ ...settings, [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
          <label>
            変更理由
            <textarea
              aria-label="利用案内の変更理由"
              required
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </fieldset>
        <button type="submit" disabled={pending || !canSave || !reason.trim()}>
          利用案内の条件を保存
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
export function UsageGuidancePolicyEditor(props: {
  endpoint: string;
  initial: SocialUsageGuidanceView;
}) {
  return <Editor key={props.endpoint} {...props} />;
}
