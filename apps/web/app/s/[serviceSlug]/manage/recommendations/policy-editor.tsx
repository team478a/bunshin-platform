'use client';
import { useRef, useState, type FormEvent } from 'react';
import {
  SOCIAL_ACTIVITY_BARRIER_CATEGORIES,
  socialActivityBarrierLabel,
  defaultSocialRecommendationSettings,
  normalizeSocialRecommendationSettings,
  type SocialRecommendationPolicyView,
} from '@bunshin/capability-social';
import { z } from 'zod';
import './policy.css';

const settingsSchema = z
  .object({
    enabled: z.boolean(),
    minimumAccepted: z.number().int().min(2).max(100),
    cooldownDays: z.number().int().min(30).max(365),
    categories: z.array(z.enum(SOCIAL_ACTIVITY_BARRIER_CATEGORIES)).max(11),
  })
  .strict();
const viewSchema = z
  .object({
    version: z.literal('social-recommendation-policy-v1'),
    revision: z.number().int().nonnegative(),
    headquarters: settingsSchema.nullable(),
    service: settingsSchema.nullable(),
    effective: settingsSchema,
    permissions: z.object({ headquarters: z.boolean(), service: z.boolean() }).strict(),
  })
  .strict();

async function parsePolicyResponse(response: Response) {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error('取得した設定を確認できません。ページを開き直してください。');
  }
  const parsed = z.object({ data: viewSchema }).strict().safeParse(raw);
  if (!parsed.success)
    throw new Error('取得した設定を確認できません。ページを開き直してください。');
  return parsed.data.data;
}

function PolicyEditor({
  endpoint,
  initial,
}: {
  endpoint: string;
  initial: SocialRecommendationPolicyView;
}) {
  const [value, setValue] = useState(initial);
  const [authority, setAuthority] = useState<'HEADQUARTERS' | 'SERVICE'>(
    initial.permissions.headquarters ? 'HEADQUARTERS' : 'SERVICE',
  );
  const [settings, setSettings] = useState(
    initial.permissions.headquarters
      ? (initial.headquarters ?? defaultSocialRecommendationSettings())
      : initial.effective,
  );
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const receipt = useRef<{ body: string; commandId: string } | null>(null);
  const minimumAccepted = authority === 'SERVICE' ? (value.headquarters?.minimumAccepted ?? 2) : 2;
  const minimumDays = authority === 'SERVICE' ? (value.headquarters?.cooldownDays ?? 30) : 30;
  const canSave =
    !denied &&
    (authority === 'HEADQUARTERS'
      ? value.permissions.headquarters
      : value.permissions.service && value.headquarters !== null);
  async function read() {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      if ([401, 403, 404].includes(response.status)) {
        setDenied(true);
        throw new Error('現在の管理権限を確認してください。');
      }
      if (!response.ok) throw new Error('設定を取得できませんでした。');
      const parsed = await parsePolicyResponse(response);
      setValue(parsed);
      setSettings(
        authority === 'HEADQUARTERS'
          ? (parsed.headquarters ?? defaultSocialRecommendationSettings())
          : parsed.effective,
      );
      receipt.current = null;
      setMessage('最新の設定を取得しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定を取得できませんでした。');
    } finally {
      setPending(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !canSave) return;
    setPending(true);
    setMessage('');
    try {
      const normalized = normalizeSocialRecommendationSettings(settings);
      const body = JSON.stringify({
        expectedRevision: value.revision,
        authority,
        settings: normalized,
        reason: reason.trim(),
      });
      if (receipt.current?.body !== body)
        receipt.current = { body, commandId: crypto.randomUUID() };
      const response = await fetch(endpoint, {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(JSON.parse(body) as object),
          commandId: receipt.current.commandId,
        }),
      });
      if ([401, 403, 404].includes(response.status)) {
        setDenied(true);
        throw new Error('管理権限または本部の許可条件を確認し、ページを開き直してください。');
      }
      if (response.status === 409)
        throw new Error(
          '他の変更が反映されています。「最新の設定を取得」で確認してから保存してください。',
        );
      if (!response.ok) throw new Error('保存できませんでした。条件を確認して再度お試しください。');
      const parsed = await parsePolicyResponse(response);
      if (parsed.revision !== value.revision + 1)
        throw new Error('保存した版を確認できません。最新の設定を取得してください。');
      const savedSettings = authority === 'HEADQUARTERS' ? parsed.headquarters : parsed.service;
      if (
        !savedSettings ||
        JSON.stringify(normalizeSocialRecommendationSettings(savedSettings)) !==
          JSON.stringify(normalized)
      )
        throw new Error('保存した条件を確認できません。最新の設定を取得してください。');
      setValue(parsed);
      receipt.current = null;
      setReason('');
      setMessage('設定を保存しました。変更は監査記録に残しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定を保存できませんでした。');
    } finally {
      setPending(false);
    }
  }
  if (denied)
    return <p role="alert">設定を表示できません。管理権限を確認し、ページを開き直してください。</p>;
  return (
    <section className="recommendation-policy" aria-label="SNS支援提案の設定">
      <p>
        新しい支援提案の条件です。開始済み支援の完了・見送りや、基本SNS機能を制限する設定ではありません。
      </p>
      <p>
        現在の版：{value.revision}。本部設定：
        {value.headquarters ? '設定済み' : '未設定（従来の標準条件）'}
      </p>
      <section className="settings-card" aria-label="現在有効な提案条件">
        <h2>適用される提案ルール</h2>
        <p>{value.effective.enabled ? 'ルール上は新規提案を許可' : 'ルールで新規提案を停止'}</p>
        <p>
          採用後未報告：{value.effective.minimumAccepted}件以上／見送り後：
          {value.effective.cooldownDays}日間抑制
        </p>
        <p>
          対象：
          {value.effective.categories.map(socialActivityBarrierLabel).join('、') || '対象なし'}
        </p>
        <p>実際の利用には、現在の機能権限と利用条件も適用されます。</p>
      </section>
      <button
        type="button"
        disabled={pending || denied}
        onClick={() => {
          void read();
        }}
      >
        最新の設定を取得
      </button>
      {!value.headquarters && !value.permissions.headquarters && (
        <p>本部設定の保存後に、自社の条件を変更できます。</p>
      )}
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <fieldset disabled={pending || denied}>
          <legend>変更する条件</legend>
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
                      ? (value.headquarters ?? defaultSocialRecommendationSettings())
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
            新しい支援提案を有効にする
          </label>
          <label>
            採用後未報告の判定件数
            <input
              aria-label="採用後未報告の判定件数"
              type="number"
              min={minimumAccepted}
              max={100}
              required
              value={settings.minimumAccepted}
              onChange={(event) =>
                setSettings({ ...settings, minimumAccepted: Number(event.target.value) })
              }
            />
          </label>
          <p>
            直近28日の採用がこの件数以上で、投稿完了報告がない場合の条件です。他の判定ルールの閾値は変更しません。
          </p>
          <label>
            見送り後の抑制日数
            <input
              aria-label="見送り後の抑制日数"
              type="number"
              min={minimumDays}
              max={365}
              required
              value={settings.cooldownDays}
              onChange={(event) =>
                setSettings({ ...settings, cooldownDays: Number(event.target.value) })
              }
            />
          </label>
          <fieldset>
            <legend>新規提案の対象となる困りごと</legend>
            {SOCIAL_ACTIVITY_BARRIER_CATEGORIES.map((category) => (
              <label key={category}>
                <input
                  type="checkbox"
                  checked={settings.categories.includes(category)}
                  disabled={
                    authority === 'SERVICE' && !value.headquarters?.categories.includes(category)
                  }
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      categories: event.target.checked
                        ? [...settings.categories, category]
                        : settings.categories.filter((value) => value !== category),
                    })
                  }
                />
                {socialActivityBarrierLabel(category)}
              </label>
            ))}
          </fieldset>
          <label>
            変更理由
            <textarea
              aria-label="変更理由"
              value={reason}
              minLength={1}
              maxLength={1000}
              required
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
        サービス側では、本部の条件より判定件数・抑制日数を減らしたり、対象を増やしたりすることはできません。提供済み支援の内容と抑制日数、確定特典は変更しません。
      </p>
    </section>
  );
}

export function RecommendationPolicyEditor(props: {
  endpoint: string;
  initial: SocialRecommendationPolicyView;
}) {
  return <PolicyEditor key={props.endpoint} {...props} />;
}
