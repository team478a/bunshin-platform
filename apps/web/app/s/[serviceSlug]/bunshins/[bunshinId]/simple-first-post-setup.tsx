'use client';

import type { SocialPlatform, SocialPostingFrequency } from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClientRequestId } from '../../../../ui/client-request-id';

const platformLabels: Record<SocialPlatform, string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
};

const frequencyOptions: Array<{ value: SocialPostingFrequency; label: string }> = [
  { value: 'WEEKLY', label: '週1回から始める' },
  { value: 'THREE_PER_WEEK', label: '週3回くらい' },
  { value: 'WEEKDAYS', label: '平日に1回ずつ' },
  { value: 'DAILY', label: '毎日' },
  { value: 'FLEXIBLE', label: '決めずに続ける' },
];

type Profile = {
  id: string;
  platform: SocialPlatform;
  status: 'ACTIVE' | 'INACTIVE';
};

type Strategy = {
  id: string;
  socialProfileId: string;
  status: 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'SUPERSEDED';
};

function preferredFormats(platform: SocialPlatform) {
  if (platform === 'TIKTOK' || platform === 'YOUTUBE_SHORTS') return ['LIVE_ACTION'] as const;
  if (platform === 'X' || platform === 'THREADS') return ['TEXT'] as const;
  return ['TEXT', 'IMAGE'] as const;
}

export function SimpleFirstPostSetup({
  serviceSlug,
  bunshinId,
  topic,
  audience,
  hasActivePillar,
  profiles,
  strategies,
  deliveryEnabled,
  deliveryTime,
}: {
  serviceSlug: string;
  bunshinId: string;
  topic: string;
  audience: string;
  hasActivePillar: boolean;
  profiles: Profile[];
  strategies: Strategy[];
  deliveryEnabled: boolean;
  deliveryTime: string;
}) {
  const router = useRouter();
  const [platform, setPlatform] = useState<SocialPlatform>('INSTAGRAM');
  const [frequency, setFrequency] = useState<SocialPostingFrequency>('WEEKLY');
  const [localTime, setLocalTime] = useState(deliveryTime);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState('');
  const [message, setMessage] = useState('');
  const encodedService = encodeURIComponent(serviceSlug);
  const encodedBunshin = encodeURIComponent(bunshinId);
  const base = `/api/services/${encodedService}/bunshins/${encodedBunshin}`;
  const ready =
    deliveryEnabled &&
    hasActivePillar &&
    profiles.some(
      (profile) =>
        profile.status === 'ACTIVE' &&
        strategies.some(
          (strategy) => strategy.socialProfileId === profile.id && strategy.status === 'APPROVED',
        ),
    );

  async function request<T>(path: string, body: unknown): Promise<T> {
    const requestId = createClientRequestId();
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': requestId },
      body: JSON.stringify(body),
    }).catch(() => {
      throw new Error(`通信できませんでした。（受付番号: ${requestId}）`);
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; requestId?: string };
      } | null;
      throw new Error(
        `${payload?.error?.message ?? '処理を完了できませんでした。'}（受付番号: ${payload?.error?.requestId ?? requestId}）`,
      );
    }
    const result = (await response.json()) as { data: T };
    return result.data;
  }

  async function prepare() {
    let currentStep = '初回設定';
    const updateStep = (value: string) => {
      currentStep = value;
      setStep(value);
    };
    setPending(true);
    setMessage('');
    try {
      if (!hasActivePillar) {
        updateStep('あなた向けの投稿テーマを準備しています');
        await request('/content-pillars', {
          title: topic.trim().slice(0, 100) || '私が伝えたいこと',
          description: topic,
          weight: 100,
        });
      }

      let profile = profiles.find(({ status }) => status === 'ACTIVE');
      if (!profile) {
        updateStep('投稿するSNSを設定しています');
        profile = await request<Profile>('/social-profiles', {
          platform,
          purpose: topic,
          postingFrequency: frequency,
          preferredFormats: preferredFormats(platform),
          defaultAssistanceLevel: 'READY_TO_USE',
        });
      }

      let strategy = strategies.find(
        (value) => value.socialProfileId === profile.id && value.status === 'APPROVED',
      );
      if (!strategy) {
        strategy = strategies.find(
          (value) => value.socialProfileId === profile.id && value.status === 'PROPOSED',
        );
        if (!strategy) {
          updateStep('あなた向けの発信方法を考えています');
          strategy = await request<Strategy>('/social-account-strategies/generate', {
            socialProfileId: profile.id,
            platform: profile.platform,
            goal: 'BRAND_AWARENESS',
            availableMinutes: 5,
            destinationType: 'PROFILE',
            destinationDetail: null,
            wizardTopic: topic,
            wizardAudience: audience,
          });
        }
        updateStep('発信方法を決定しています');
        await request(`/social-account-strategies/${encodeURIComponent(strategy.id)}/approve`, {});
      }

      updateStep('自動で受け取る設定を保存しています');
      await request('/automatic-delivery', { enabled: true, localTime });

      setStep('');
      setMessage('設定できました。投稿予定の日にLINEでお知らせします。画面を閉じて大丈夫です。');
      router.refresh();
    } catch (error) {
      setMessage(
        `「${currentStep}」で処理が止まりました。${error instanceof Error ? error.message : '処理を完了できませんでした。'} 保存済みの内容は残っています。画面を更新して、もう一度お試しください。`,
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (ready) {
    return (
      <section className="simple-first-post simple-first-post--ready">
        <span aria-hidden="true">✓</span>
        <div>
          <h2>投稿案を自動でお届けします</h2>
          <p>
            投稿予定の日の{deliveryTime}
            ごろ（日本時間）にLINEでお知らせします。予定の準備や投稿案の生成は自動です。
          </p>
        </div>
        <a className="button button--primary" href="#today-post">
          届いた投稿案を見る
        </a>
      </section>
    );
  }

  return (
    <section className="simple-first-post" aria-labelledby="simple-setup-title">
      <header>
        <p className="eyebrow">かんたん設定</p>
        <h2 id="simple-setup-title">最初に設定すると、投稿案がLINEに届きます</h2>
        <p>投稿するSNSとペースを選んでください。投稿予定と内容はこちらで準備します。</p>
      </header>
      {profiles.some(({ status }) => status === 'ACTIVE') ? null : (
        <fieldset>
          <legend>1. どのSNSに投稿しますか？</legend>
          <div className="simple-first-post__choices">
            {(Object.keys(platformLabels) as SocialPlatform[]).map((value) => (
              <label key={value} className={platform === value ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="simple-platform"
                  value={value}
                  checked={platform === value}
                  onChange={() => setPlatform(value)}
                />
                {platformLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {profiles.some(({ status }) => status === 'ACTIVE') ? null : (
        <fieldset>
          <legend>2. どのくらいのペースで投稿しますか？</legend>
          <div className="simple-first-post__choices simple-first-post__choices--frequency">
            {frequencyOptions.map((option) => (
              <label key={option.value} className={frequency === option.value ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="simple-frequency"
                  value={option.value}
                  checked={frequency === option.value}
                  onChange={() => setFrequency(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label>
        受け取る時刻（日本時間）
        <input
          type="time"
          min="07:00"
          max="20:59"
          value={localTime}
          onChange={(event) => setLocalTime(event.target.value)}
        />
      </label>
      <p>
        下のボタンでLINE通知を受け取ることに同意し、自動のお届けを開始します。LINE公式アカウントの友だち追加が必要です。最初のお届けは次の投稿予定日です。SNSへの投稿はご自身で行います。
      </p>
      <button
        className="button button--primary button--full"
        type="button"
        disabled={pending}
        onClick={() => void prepare()}
      >
        {pending ? step || '準備しています…' : 'この設定で自動のお届けを始める'}
      </button>
      {pending ? (
        <p className="simple-first-post__wait">少し時間がかかります。そのままお待ちください。</p>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
