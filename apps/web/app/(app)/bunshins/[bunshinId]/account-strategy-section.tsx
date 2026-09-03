'use client';
import {
  SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS,
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  type SocialAccountStrategyDestination,
  type SocialAccountStrategyGoal,
  type SocialAccountStrategyStatus,
  type SocialPlatform,
} from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
export interface StrategyView {
  id: string;
  socialProfileId: string;
  platform: SocialPlatform;
  concept: string;
  positioning: string;
  targetSummary: string;
  version: number;
  status: SocialAccountStrategyStatus;
}
const goalLabels: Record<SocialAccountStrategyGoal, string> = {
  FOLLOWERS: '見てくれる人を増やす',
  LINE_REGISTRATION: 'LINEに登録してもらう',
  INQUIRY: '問い合わせを増やす',
  SALES: '商品を買ってもらう',
  RECRUIT: 'いっしょに働く人を探す',
  BRAND_AWARENESS: '名前や活動を知ってもらう',
  BLOG_TRAFFIC: 'ブログを読んでもらう',
  OTHER: 'その他',
};
const destinationLabels: Record<SocialAccountStrategyDestination, string> = {
  PROFILE: 'SNSの自己紹介ページ',
  LINE: 'LINE',
  LP: '案内ページ',
  BLOG: 'ブログ',
  EC: 'ネットショップ',
  INQUIRY: '問い合わせページ',
  RECRUIT_PAGE: '求人ページ',
  NONE: '特になし',
  OTHER: 'その他',
};
const strategyStatusLabels: Record<SocialAccountStrategyStatus, string> = {
  DRAFT: '作成中',
  PROPOSED: '確認待ち',
  APPROVED: '決定済み',
  SUPERSEDED: '古い案',
};
const platformLabels: Record<SocialPlatform, string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
};
export function AccountStrategySection({
  workspaceId,
  bunshinId,
  profiles,
  strategies,
  active,
  endpointBase,
}: {
  workspaceId: string;
  bunshinId: string;
  profiles: Array<{ id: string; platform: SocialPlatform }>;
  strategies: StrategyView[];
  active: boolean;
  endpointBase?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    socialProfileId: profiles[0]?.id ?? '',
    topic: '',
    audience: '',
    goal: 'FOLLOWERS' as SocialAccountStrategyGoal,
    availableMinutes: 5 as 3 | 5 | 10 | 20,
    destinationType: 'PROFILE' as SocialAccountStrategyDestination,
    destinationDetail: '',
  });
  const profile = profiles.find((item) => item.id === form.socialProfileId);
  const endpoint =
    endpointBase ??
    `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/social-account-strategies`;
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setPending(true);
    const response = await fetch(`${endpoint}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        socialProfileId: profile.id,
        platform: profile.platform,
        goal: form.goal,
        availableMinutes: form.availableMinutes,
        destinationType: form.destinationType,
        destinationDetail: form.destinationDetail || null,
        wizardTopic: form.topic,
        wizardAudience: form.audience,
      }),
    });
    setPending(false);
    setMessage(
      response.ok
        ? '戦略案を保存しました。内容を確認して承認してください。'
        : '戦略案を保存できませんでした。',
    );
    if (response.ok) router.refresh();
  }
  async function approve(id: string) {
    setPending(true);
    const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    setPending(false);
    setMessage(response.ok ? '戦略を承認しました。' : '承認できませんでした。');
    if (response.ok) router.refresh();
  }
  return (
    <section className="strategy-section">
      <header className="strategy-section__header">
        <p className="eyebrow">発信の準備</p>
        <h2>SNSで何を伝えるか決める</h2>
        <p>短い質問に答えると、あなたに合う発信の進め方を考えます。</p>
      </header>
      {active && profiles.length ? (
        <form className="strategy-form" onSubmit={(e) => void create(e)}>
          <label className="field">
            <span className="field__label">使うSNS</span>
            <select
              className="field__control"
              value={form.socialProfileId}
              onChange={(e) => setForm({ ...form, socialProfileId: e.target.value })}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {platformLabels[p.platform]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">何について発信しますか？</span>
            <input
              className="field__control"
              required
              placeholder="例：副業を始めたい人への情報"
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">誰に見てほしいですか？</span>
            <input
              className="field__control"
              required
              placeholder="例：仕事や家事で忙しい30代の人"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">SNSを使う目的</span>
            <select
              className="field__control"
              value={form.goal}
              onChange={(e) =>
                setForm({ ...form, goal: e.target.value as SocialAccountStrategyGoal })
              }
            >
              {SOCIAL_ACCOUNT_STRATEGY_GOALS.map((v) => (
                <option key={v} value={v}>
                  {goalLabels[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">1日に使える時間</span>
            <select
              className="field__control"
              value={form.availableMinutes}
              onChange={(e) =>
                setForm({ ...form, availableMinutes: Number(e.target.value) as 3 | 5 | 10 | 20 })
              }
            >
              {[3, 5, 10, 20].map((v) => (
                <option key={v} value={v}>
                  {v}分
                </option>
              ))}
            </select>
          </label>
          <label className="field strategy-form__wide">
            <span className="field__label">投稿を見た人に、次にどこへ行ってほしいですか？</span>
            <select
              className="field__control"
              value={form.destinationType}
              onChange={(e) =>
                setForm({
                  ...form,
                  destinationType: e.target.value as SocialAccountStrategyDestination,
                })
              }
            >
              {SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS.map((v) => (
                <option key={v} value={v}>
                  {destinationLabels[v]}
                </option>
              ))}
            </select>
          </label>
          <button className="button strategy-form__wide" disabled={pending}>
            {pending ? '発信の進め方を考えています…' : '発信の進め方を考えてもらう'}
          </button>
        </form>
      ) : (
        <p className="strategy-section__empty">
          先に「SNSのお手伝い」を始めて、使いたいSNSを決めてください。
        </p>
      )}
      <div className="strategy-section__list-heading">
        <h3>作成した発信の進め方</h3>
        <span>{strategies.length}件</span>
      </div>
      <ul className="strategy-list">
        {strategies.map((s) => (
          <li key={s.id}>
            <div className="strategy-list__title">
              <strong>{platformLabels[s.platform]}の発信案</strong>
              <span>{strategyStatusLabels[s.status]}</span>
            </div>
            <p>{s.concept}</p>
            <small>届けたい人：{s.targetSummary}</small>
            {s.status !== 'APPROVED' && s.status !== 'SUPERSEDED' && active ? (
              <button
                className="button button--secondary"
                disabled={pending}
                onClick={() => void approve(s.id)}
              >
                この進め方に決める
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {message ? (
        <p className="strategy-section__message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
