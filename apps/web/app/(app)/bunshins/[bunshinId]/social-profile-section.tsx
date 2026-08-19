'use client';

import type {
  SocialPlatform,
  SocialPostingFrequency,
  SocialPreferredFormat,
  SocialProfileStatus,
} from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { SocialCapabilityStatus } from './capability-section';

export interface SocialProfileView {
  platform: SocialPlatform;
  handle: string | null;
  profileUrl: string | null;
  purpose: string;
  postingFrequency: SocialPostingFrequency;
  preferredFormats: SocialPreferredFormat[];
  status: SocialProfileStatus;
}

const platforms = ['INSTAGRAM', 'TIKTOK', 'X', 'OTHER'] as const;
const frequencies = ['DAILY', 'WEEKDAYS', 'THREE_PER_WEEK', 'WEEKLY', 'FLEXIBLE'] as const;
const formats = ['SLIDE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT', 'IMAGE'] as const;
const frequencyLabels: Record<SocialPostingFrequency, string> = {
  DAILY: '毎日',
  WEEKDAYS: '平日',
  THREE_PER_WEEK: '週3回',
  WEEKLY: '週1回',
  FLEXIBLE: '柔軟に設定',
};
const formatLabels: Record<SocialPreferredFormat, string> = {
  SLIDE: 'スライド',
  LIVE_ACTION: '実写',
  AI_VIDEO_PROMPT: '動画用プロンプト',
  IMAGE: '画像',
};

type FormState = Omit<SocialProfileView, 'status'>;
const empty: FormState = {
  platform: 'INSTAGRAM',
  handle: '',
  profileUrl: '',
  purpose: '',
  postingFrequency: 'WEEKLY',
  preferredFormats: ['SLIDE'],
};

function ProfileForm({
  initial,
  availablePlatforms,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  availablePlatforms?: SocialPlatform[];
  pending: boolean;
  onSubmit: (value: FormState) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  function toggle(format: SocialPreferredFormat) {
    setForm({
      ...form,
      preferredFormats: form.preferredFormats.includes(format)
        ? form.preferredFormats.filter((value) => value !== format)
        : [...form.preferredFormats, format],
    });
  }
  return (
    <form
      className="social-profile-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onSubmit(form);
      }}
    >
      <label>
        Platform
        <select
          value={form.platform}
          disabled={availablePlatforms === undefined}
          onChange={(event) => setForm({ ...form, platform: event.target.value as SocialPlatform })}
        >
          {(availablePlatforms ?? [form.platform]).map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Handle（任意）
        <input
          value={form.handle ?? ''}
          maxLength={100}
          onChange={(event) => setForm({ ...form, handle: event.target.value })}
        />
      </label>
      <label>
        Profile URL（任意・HTTPS）
        <input
          type="url"
          value={form.profileUrl ?? ''}
          maxLength={2048}
          onChange={(event) => setForm({ ...form, profileUrl: event.target.value })}
        />
      </label>
      <label>
        発信目的
        <textarea
          required
          maxLength={500}
          value={form.purpose}
          onChange={(event) => setForm({ ...form, purpose: event.target.value })}
        />
      </label>
      <label>
        投稿頻度
        <select
          value={form.postingFrequency}
          onChange={(event) =>
            setForm({ ...form, postingFrequency: event.target.value as SocialPostingFrequency })
          }
        >
          {frequencies.map((value) => (
            <option key={value} value={value}>
              {frequencyLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>希望形式（1つ以上）</legend>
        {formats.map((value) => (
          <label key={value} className="social-format-option">
            <input
              type="checkbox"
              checked={form.preferredFormats.includes(value)}
              onChange={() => toggle(value)}
            />
            {formatLabels[value]}
          </label>
        ))}
      </fieldset>
      <div className="social-profile-actions">
        <button disabled={pending || form.preferredFormats.length === 0} type="submit">
          保存
        </button>
        {onCancel ? (
          <button disabled={pending} type="button" onClick={onCancel}>
            キャンセル
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function SocialProfileSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  profiles,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: SocialCapabilityStatus;
  profiles: SocialProfileView[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SocialPlatform | 'NEW' | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/social-profiles`;
  const available = platforms.filter(
    (value) => !profiles.some(({ platform }) => platform === value),
  );

  async function mutation(url: string, method: 'POST' | 'PATCH', body: unknown) {
    setPending(true);
    setMessage(null);
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setPending(false);
    setMessage(
      response.ok
        ? 'Social Profileを更新しました。'
        : 'Social Profileを更新できませんでした。入力内容とSOCIALの状態を確認してください。',
    );
    if (response.ok) {
      setEditing(null);
      router.refresh();
    }
  }

  const readonly = capabilityStatus === 'SUSPENDED' || capabilityStatus === 'LOCKED';
  return (
    <section className="social-profile-section">
      <h2>Social Profile</h2>
      <p>SNS接続・投稿機能は後続Phaseで提供します。ここでは発信方針だけを手動設定します。</p>
      {capabilityStatus === null ? <p>先にSOCIAL Capabilityを割り当ててください。</p> : null}
      {readonly ? (
        <p>
          SOCIALが{capabilityStatus === 'LOCKED' ? 'ロック中' : '停止中'}
          のため、現在は参照のみ可能です。
        </p>
      ) : null}
      <ul className="social-profile-list">
        {profiles.map((profile) => (
          <li className="social-profile-card" key={profile.platform}>
            <h3>
              {profile.platform} <small>{profile.status === 'ACTIVE' ? '有効' : '停止'}</small>
            </h3>
            {editing === profile.platform ? (
              <ProfileForm
                initial={profile}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSubmit={(value) =>
                  mutation(`${endpoint}/${profile.platform}`, 'PATCH', {
                    ...value,
                    platform: undefined,
                  })
                }
              />
            ) : (
              <>
                <p>{profile.handle ? `@${profile.handle}` : 'Handle未設定'}</p>
                <p>{profile.purpose}</p>
                <p>頻度: {frequencyLabels[profile.postingFrequency]}</p>
                <p>
                  形式: {profile.preferredFormats.map((value) => formatLabels[value]).join('、')}
                </p>
                {!readonly && capabilityStatus === 'ACTIVE' ? (
                  <div className="social-profile-actions">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setEditing(profile.platform)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void mutation(
                          `${endpoint}/${profile.platform}/${profile.status === 'ACTIVE' ? 'deactivate' : 'activate'}`,
                          'POST',
                          {},
                        )
                      }
                    >
                      {profile.status === 'ACTIVE' ? '停止する' : '再有効化する'}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {capabilityStatus === 'ACTIVE' && available.length > 0 && editing === null ? (
        <button type="button" onClick={() => setEditing('NEW')}>
          Profileを追加
        </button>
      ) : null}
      {editing === 'NEW' ? (
        <ProfileForm
          initial={{ ...empty, platform: available[0] ?? 'OTHER' }}
          availablePlatforms={[...available]}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(value) => mutation(endpoint, 'POST', value)}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
