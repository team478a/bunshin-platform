'use client';

import {
  SOCIAL_PLATFORMS,
  SOCIAL_PREFERRED_FORMATS,
  type SocialPlatform,
  type SocialPostingFrequency,
  type SocialPreferredFormat,
  type SocialProfileStatus,
} from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { SocialCapabilityStatus } from './capability-section';

export interface SocialProfileView {
  id: string;
  platform: SocialPlatform;
  handle: string | null;
  profileUrl: string | null;
  purpose: string;
  postingFrequency: SocialPostingFrequency;
  preferredFormats: SocialPreferredFormat[];
  status: SocialProfileStatus;
}

const frequencies = ['DAILY', 'WEEKDAYS', 'THREE_PER_WEEK', 'WEEKLY', 'FLEXIBLE'] as const;
const frequencyLabels: Record<SocialPostingFrequency, string> = {
  DAILY: '毎日',
  WEEKDAYS: '平日',
  THREE_PER_WEEK: '週3回',
  WEEKLY: '週1回',
  FLEXIBLE: '柔軟に設定',
};
const formatLabels: Record<SocialPreferredFormat, string> = {
  TEXT: 'テキスト',
  SLIDE: 'スライド',
  LIVE_ACTION: '実写',
  AI_VIDEO_PROMPT: 'AI動画の作り方',
  IMAGE: '画像',
};
const platformLabels: Record<SocialPlatform, string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
};

type FormState = Omit<SocialProfileView, 'id' | 'status'>;
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
        使うSNS
        <select
          value={form.platform}
          disabled={availablePlatforms === undefined}
          onChange={(event) => setForm({ ...form, platform: event.target.value as SocialPlatform })}
        >
          {(availablePlatforms ?? [form.platform]).map((value) => (
            <option key={value} value={value}>
              {platformLabels[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        SNSのアカウント名（わかる場合だけ）
        <input
          value={form.handle ?? ''}
          maxLength={100}
          onChange={(event) => setForm({ ...form, handle: event.target.value })}
        />
      </label>
      <label>
        SNSページのURL（わかる場合だけ）
        <input
          type="url"
          value={form.profileUrl ?? ''}
          maxLength={2048}
          onChange={(event) => setForm({ ...form, profileUrl: event.target.value })}
        />
      </label>
      <label>
        どんな人に、何を伝えたいですか？
        <textarea
          required
          maxLength={500}
          value={form.purpose}
          onChange={(event) => setForm({ ...form, purpose: event.target.value })}
        />
      </label>
      <label>
        どのくらい投稿しますか？
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
        <legend>どんな投稿を作りたいですか？（1つ以上）</legend>
        {SOCIAL_PREFERRED_FORMATS.map((value) => (
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
  const available = SOCIAL_PLATFORMS.filter(
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
        ? 'SNSの設定を保存しました。'
        : 'SNSの設定を保存できませんでした。入力した内容を確認してください。',
    );
    if (response.ok) {
      setEditing(null);
      router.refresh();
    }
  }

  const readonly = capabilityStatus === 'SUSPENDED' || capabilityStatus === 'LOCKED';
  return (
    <section className="social-profile-section">
      <h2>使いたいSNSを決める</h2>
      <p>インスタグラムやXなど、どのSNSで、だれに、何を伝えたいかを決めます。</p>
      <p>BUNSHINが投稿案を作ります。SNSへの投稿は、あなたが自分で行います。</p>
      {capabilityStatus === null ? (
        <p>まず、上の「SNSのお手伝いをはじめる」を押してください。</p>
      ) : null}
      {readonly ? <p>今は設定を見ることだけできます。内容を変えることはできません。</p> : null}
      <ul className="social-profile-list">
        {profiles.map((profile) => (
          <li className="social-profile-card" key={profile.platform}>
            <h3>
              {platformLabels[profile.platform]}{' '}
              <small>{profile.status === 'ACTIVE' ? '使用中' : 'お休み中'}</small>
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
                <p>
                  {profile.handle ? `アカウント名：@${profile.handle}` : 'アカウント名：未入力'}
                </p>
                <p>{profile.purpose}</p>
                <p>投稿する回数：{frequencyLabels[profile.postingFrequency]}</p>
                <p>
                  投稿の形：
                  {profile.preferredFormats.map((value) => formatLabels[value]).join('、')}
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
                      {profile.status === 'ACTIVE' ? 'お休みにする' : 'もう一度使う'}
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
          使うSNSを追加
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
