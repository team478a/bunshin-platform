'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SocialCapabilityStatus } from './capability-section';
import type { ContentPillarView } from './content-pillar-section';
import type { SocialProfileView } from './social-profile-section';
import { WeeklyPlanCard } from './weekly-plan-card';
import { addDays, monday, platformLabels, type WeeklyPlanView } from './weekly-plan-types';

export type { WeeklyPlanItemView, WeeklyPlanView } from './weekly-plan-types';

export function WeeklyPlanSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  profiles,
  pillars,
  plans,
  endpointBase,
  managedGenerationOnly = false,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: SocialCapabilityStatus;
  profiles: SocialProfileView[];
  pillars: ContentPillarView[];
  plans: WeeklyPlanView[];
  endpointBase?: string;
  managedGenerationOnly?: boolean;
}) {
  const router = useRouter();
  const endpoint =
    endpointBase ??
    `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/weekly-plans`;
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('Asia/Tokyo');
  const [weekStartDate, setWeekStartDate] = useState(monday());
  const [strategySummary, setStrategySummary] = useState('');
  const activeProfiles = profiles.filter(({ status }) => status === 'ACTIVE');
  const [socialProfileId, setSocialProfileId] = useState(activeProfiles[0]?.id ?? '');
  const readonly = capabilityStatus === 'SUSPENDED' || capabilityStatus === 'LOCKED';
  const activePillars = pillars.filter((pillar) => pillar.active);

  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo');
    } catch {
      setTimezone('Asia/Tokyo');
    }
  }, []);

  async function mutation(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      setMessage(
        response.ok
          ? '1週間の予定を保存しました。'
          : '1週間の予定を保存できませんでした。入力した内容を確認してください。',
      );
      if (response.ok) {
        setCreating(false);
        setEditingItem(null);
        setAddingTo(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="weekly-plan-section">
      <div className="content-planning__heading">
        <div>
          <p className="content-planning__eyebrow">今週の準備</p>
          <h2>1週間の投稿予定</h2>
          <p>投稿パートナーが、決めたSNSと投稿テーマを使って、1週間分の予定を考えます。</p>
        </div>
        <span className="content-planning__count">予定 {plans.length}件</span>
      </div>
      {capabilityStatus === null ? (
        <p className="content-planning__notice">
          先に「SNSのお手伝いをはじめる」を押してください。
        </p>
      ) : null}
      {readonly ? (
        <p className="content-planning__notice">
          今は予定を見ることだけできます。内容を変えることはできません。
        </p>
      ) : null}
      {plans.length === 0 ? (
        <p className="content-planning__empty">
          1週間の投稿予定はまだありません。SNSと投稿テーマを登録すると、ここから予定を作れます。
        </p>
      ) : null}
      {capabilityStatus === 'ACTIVE' ? (
        <form
          className="weekly-plan-form"
          onSubmit={(event) => {
            event.preventDefault();
            void mutation(`${endpoint}/generate`, 'POST', {
              weekStartDate,
              timezone,
              socialProfileId,
            });
          }}
        >
          <h3>投稿パートナーに1週間の予定を考えてもらう</h3>
          <label>
            SNS
            <select
              required
              value={socialProfileId}
              onChange={(event) => setSocialProfileId(event.target.value)}
            >
              <option value="">選択してください</option>
              {activeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {platformLabels[profile.platform]}
                </option>
              ))}
            </select>
          </label>
          <label>
            週開始日（月曜日）
            <input
              required
              type="date"
              value={weekStartDate}
              onChange={(event) => setWeekStartDate(event.target.value)}
            />
          </label>
          <label>
            住んでいる地域の時間
            <input
              required
              maxLength={64}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </label>
          <button
            disabled={
              pending ||
              !socialProfileId ||
              activePillars.length === 0 ||
              activeProfiles.length === 0
            }
            type="submit"
          >
            1週間の予定を作る
          </button>
          {activeProfiles.length === 0 ? <p>先に、使いたいSNSを登録してください。</p> : null}
          {activePillars.length === 0 ? (
            <p>先に、投稿するテーマを1つ以上登録してください。</p>
          ) : null}
        </form>
      ) : null}
      {plans.map((plan) => (
        <WeeklyPlanCard
          key={plan.id}
          plan={plan}
          capabilityStatus={capabilityStatus}
          managedGenerationOnly={managedGenerationOnly}
          pending={pending}
          pillars={pillars}
          endpoint={endpoint}
          editingItem={editingItem}
          setEditingItem={setEditingItem}
          addingTo={addingTo}
          setAddingTo={setAddingTo}
          mutation={mutation}
        />
      ))}
      {capabilityStatus === 'ACTIVE' && !creating && !managedGenerationOnly ? (
        <button disabled={pending} type="button" onClick={() => setCreating(true)}>
          自分で1週間の予定を作る
        </button>
      ) : null}
      {creating ? (
        <form
          className="weekly-plan-form"
          onSubmit={(event) => {
            event.preventDefault();
            void mutation(endpoint, 'POST', { weekStartDate, timezone, strategySummary });
          }}
        >
          <label>
            週開始日（月曜日）
            <input
              required
              type="date"
              value={weekStartDate}
              onChange={(event) => setWeekStartDate(event.target.value)}
            />
          </label>
          <p>
            {weekStartDate}〜{addDays(weekStartDate, 6)}
          </p>
          <label>
            住んでいる地域の時間
            <input
              required
              maxLength={64}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </label>
          <label>
            戦略（任意）
            <textarea
              maxLength={1000}
              value={strategySummary}
              onChange={(event) => setStrategySummary(event.target.value)}
            />
          </label>
          <div className="weekly-plan-actions">
            <button disabled={pending} type="submit">
              作成
            </button>
            <button disabled={pending} type="button" onClick={() => setCreating(false)}>
              キャンセル
            </button>
          </div>
        </form>
      ) : null}
      <p>1週間に作れる予定は1つです。同じ日に登録できる投稿は1つです。</p>
      {message ? (
        <p className="form-feedback" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
