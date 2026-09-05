'use client';

import type { SocialPlatform, SocialPostingFrequency } from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

type Plan = {
  id: string;
  weekStartDate: string;
  status: 'DRAFT' | 'CONFIRMED' | 'EXPIRED';
};

function localDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentMonday() {
  const value = new Date();
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return localDate(value);
}

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
  plans,
  hasTodayMission,
}: {
  serviceSlug: string;
  bunshinId: string;
  topic: string;
  audience: string;
  hasActivePillar: boolean;
  profiles: Profile[];
  strategies: Strategy[];
  plans: Plan[];
  hasTodayMission: boolean;
}) {
  const router = useRouter();
  const [platform, setPlatform] = useState<SocialPlatform>('INSTAGRAM');
  const [frequency, setFrequency] = useState<SocialPostingFrequency>('WEEKLY');
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState('');
  const [message, setMessage] = useState('');
  const encodedService = encodeURIComponent(serviceSlug);
  const encodedBunshin = encodeURIComponent(bunshinId);
  const base = `/api/services/${encodedService}/bunshins/${encodedBunshin}`;
  const ready =
    hasActivePillar &&
    profiles.some(({ status }) => status === 'ACTIVE') &&
    strategies.some(({ status }) => status === 'APPROVED') &&
    plans.some(({ status }) => status === 'CONFIRMED') &&
    hasTodayMission;

  async function request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(path);
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

      const weekStartDate = currentMonday();
      let plan = plans.find(
        (value) => value.weekStartDate === weekStartDate && value.status === 'CONFIRMED',
      );
      if (!plan) {
        plan = plans.find(
          (value) => value.weekStartDate === weekStartDate && value.status === 'DRAFT',
        );
        if (!plan) {
          updateStep('今週の投稿予定を考えています');
          plan = await request<Plan>('/weekly-plans/generate', {
            weekStartDate,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
            socialProfileId: profile.id,
          });
        }
        updateStep('今週の予定を決定しています');
        await request(`/weekly-plans/${encodeURIComponent(plan.id)}/confirm`, {});
      }

      if (!hasTodayMission) {
        updateStep('今日の投稿案を作っています');
        await request('/daily-missions/generate', {
          missionDate: localDate(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
          socialProfileId: profile.id,
          idempotencyKey: crypto.randomUUID(),
        });
      }

      setStep('');
      setMessage('準備できました。下の「今日の投稿案」から内容を確認できます。');
      router.refresh();
    } catch {
      setMessage(
        `「${currentStep}」で処理が止まりました。保存済みの内容は残っています。画面を更新して、もう一度お試しください。`,
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
          <h2>投稿の準備ができています</h2>
          <p>下の「今日の投稿案」から、内容を確認してください。</p>
        </div>
        <a className="button button--primary" href="#today-post">
          今日の投稿案を見る
        </a>
      </section>
    );
  }

  return (
    <section className="simple-first-post" aria-labelledby="simple-setup-title">
      <header>
        <p className="eyebrow">かんたん設定</p>
        <h2 id="simple-setup-title">2つ選ぶだけで、今日の投稿案を準備します</h2>
        <p>細かい内容は、最初に答えた内容をもとにシステムが設定します。</p>
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
      <button
        className="button button--primary button--full"
        type="button"
        disabled={pending}
        onClick={() => void prepare()}
      >
        {pending ? step || '準備しています…' : 'この内容で今日の投稿案を準備する'}
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
