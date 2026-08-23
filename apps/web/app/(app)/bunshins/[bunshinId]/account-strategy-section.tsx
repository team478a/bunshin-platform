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
export function AccountStrategySection({
  workspaceId,
  bunshinId,
  profiles,
  strategies,
  active,
}: {
  workspaceId: string;
  bunshinId: string;
  profiles: Array<{ id: string; platform: SocialPlatform }>;
  strategies: StrategyView[];
  active: boolean;
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
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setPending(true);
    const response = await fetch(
      `/api/workspaces/${workspaceId}/bunshins/${bunshinId}/social-account-strategies/generate`,
      {
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
      },
    );
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
    const response = await fetch(
      `/api/workspaces/${workspaceId}/bunshins/${bunshinId}/social-account-strategies/${id}/approve`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    );
    setPending(false);
    setMessage(response.ok ? '戦略を承認しました。' : '承認できませんでした。');
    if (response.ok) router.refresh();
  }
  return (
    <section>
      <h2>SNSアカウント戦略</h2>
      <p>
        最大7問で運用方針を作成します。顔・声の方針と雰囲気の正本は既存Bunshin設定を利用し、ここで二重管理しません。
      </p>
      {active && profiles.length ? (
        <form onSubmit={(e) => void create(e)}>
          <label>
            SNS
            <select
              value={form.socialProfileId}
              onChange={(e) => setForm({ ...form, socialProfileId: e.target.value })}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.platform}
                </option>
              ))}
            </select>
          </label>
          <label>
            何について発信しますか？
            <input
              required
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
            />
          </label>
          <label>
            誰に見てほしいですか？
            <input
              required
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            />
          </label>
          <label>
            目的
            <select
              value={form.goal}
              onChange={(e) =>
                setForm({ ...form, goal: e.target.value as SocialAccountStrategyGoal })
              }
            >
              {SOCIAL_ACCOUNT_STRATEGY_GOALS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            1日に使える時間
            <select
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
          <label>
            誘導先
            <select
              value={form.destinationType}
              onChange={(e) =>
                setForm({
                  ...form,
                  destinationType: e.target.value as SocialAccountStrategyDestination,
                })
              }
            >
              {SOCIAL_ACCOUNT_STRATEGY_DESTINATIONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button disabled={pending}>戦略案を作成</button>
        </form>
      ) : (
        <p>先に「SNSのお手伝い」を始めて、使いたいSNSを決めてください。</p>
      )}
      <ul>
        {strategies.map((s) => (
          <li key={s.id}>
            <strong>
              {s.platform} v{s.version} / {s.status}
            </strong>
            <p>
              {s.concept} — {s.targetSummary}
            </p>
            {s.status !== 'APPROVED' && s.status !== 'SUPERSEDED' && active ? (
              <button disabled={pending} onClick={() => void approve(s.id)}>
                この戦略を承認
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
