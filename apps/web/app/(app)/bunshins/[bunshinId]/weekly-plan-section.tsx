'use client';

import { SOCIAL_PREFERRED_FORMATS, type SocialPreferredFormat } from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { SocialCapabilityStatus } from './capability-section';
import type { ContentPillarView } from './content-pillar-section';
import type { SocialProfileView } from './social-profile-section';

export interface WeeklyPlanItemView {
  id: string;
  scheduledDate: string;
  contentPillarId: string;
  goal: string;
  angle: string;
  recommendedFormat: SocialPreferredFormat;
  notes: string | null;
}

export interface WeeklyPlanView {
  id: string;
  weekStartDate: string;
  timezone: string;
  strategySummary: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'EXPIRED';
  items: WeeklyPlanItemView[];
}

type ItemFormValue = Omit<WeeklyPlanItemView, 'id'>;

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monday(value = new Date()) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function ItemForm({
  initial,
  pillars,
  weekStartDate,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: ItemFormValue;
  pillars: ContentPillarView[];
  weekStartDate: string;
  pending: boolean;
  onSubmit: (value: ItemFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  return (
    <form
      className="weekly-plan-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onSubmit(form);
      }}
    >
      <label>
        予定日
        <input
          required
          type="date"
          min={weekStartDate}
          max={addDays(weekStartDate, 6)}
          value={form.scheduledDate}
          onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
        />
      </label>
      <label>
        Content Pillar
        <select
          required
          value={form.contentPillarId}
          onChange={(event) => setForm({ ...form, contentPillarId: event.target.value })}
        >
          <option value="">選択してください</option>
          {pillars
            .filter((pillar) => pillar.active)
            .map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        目的
        <input
          required
          maxLength={200}
          value={form.goal}
          onChange={(event) => setForm({ ...form, goal: event.target.value })}
        />
      </label>
      <label>
        切り口
        <textarea
          required
          maxLength={500}
          value={form.angle}
          onChange={(event) => setForm({ ...form, angle: event.target.value })}
        />
      </label>
      <label>
        推奨形式
        <select
          value={form.recommendedFormat}
          onChange={(event) =>
            setForm({ ...form, recommendedFormat: event.target.value as SocialPreferredFormat })
          }
        >
          {SOCIAL_PREFERRED_FORMATS.map((format) => (
            <option key={format}>{format}</option>
          ))}
        </select>
      </label>
      <label>
        メモ（任意）
        <textarea
          maxLength={1000}
          value={form.notes ?? ''}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </label>
      <div className="weekly-plan-actions">
        <button disabled={pending} type="submit">
          保存
        </button>
        <button disabled={pending} type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

export function WeeklyPlanSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  profiles,
  pillars,
  plans,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: SocialCapabilityStatus;
  profiles: SocialProfileView[];
  pillars: ContentPillarView[];
  plans: WeeklyPlanView[];
}) {
  const router = useRouter();
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/weekly-plans`;
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
          ? 'Weekly Planを更新しました。'
          : 'Weekly Planを更新できませんでした。入力内容、週、Pillar、SOCIALの状態を確認してください。',
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

  const emptyItem = (plan: WeeklyPlanView): ItemFormValue => ({
    scheduledDate: plan.weekStartDate,
    contentPillarId: activePillars[0]?.id ?? '',
    goal: '',
    angle: '',
    recommendedFormat: 'SLIDE',
    notes: null,
  });

  return (
    <section className="weekly-plan-section">
      <h2>Weekly Plan</h2>
      <p>承認済みSNS戦略とActive Content Pillarから、AIが1週間のDRAFT計画を作成します。</p>
      {capabilityStatus === null ? <p>先にSOCIALを割り当ててください。</p> : null}
      {readonly ? (
        <p>
          SOCIALが{capabilityStatus === 'LOCKED' ? 'ロック中' : '停止中'}のため参照のみ可能です。
        </p>
      ) : null}
      {plans.length === 0 ? <p>Weekly Planはまだありません。</p> : null}
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
          <h3>AIで週間計画を作成</h3>
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
                  {profile.platform}
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
            Timezone
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
            AIでDRAFTを作成
          </button>
          {activeProfiles.length === 0 ? (
            <p>先にActiveなSNSプロファイルを作成してください。</p>
          ) : null}
          {activePillars.length === 0 ? (
            <p>先にActiveなContent Pillarを作成してください。</p>
          ) : null}
        </form>
      ) : null}
      {plans.map((plan) => {
        const editable = capabilityStatus === 'ACTIVE' && plan.status === 'DRAFT';
        return (
          <article className="weekly-plan-card" key={plan.id}>
            <h3>
              {plan.weekStartDate}〜{addDays(plan.weekStartDate, 6)} <small>{plan.status}</small>
            </h3>
            <p>Timezone: {plan.timezone}</p>
            {editable ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const strategy = data.get('strategySummary');
                  void mutation(`${endpoint}/${plan.id}`, 'PATCH', {
                    strategySummary: typeof strategy === 'string' ? strategy : '',
                  });
                }}
              >
                <label>
                  戦略
                  <textarea
                    name="strategySummary"
                    maxLength={1000}
                    defaultValue={plan.strategySummary ?? ''}
                  />
                </label>
                <button disabled={pending} type="submit">
                  戦略を保存
                </button>
              </form>
            ) : (
              <p>戦略: {plan.strategySummary || '未設定'}</p>
            )}
            {plan.status !== 'DRAFT' ? <p>確定または失効後のPlanは編集できません。</p> : null}
            <ul className="weekly-plan-items">
              {plan.items.map((item) => (
                <li key={item.id}>
                  {editingItem === item.id ? (
                    <ItemForm
                      initial={item}
                      pillars={pillars}
                      weekStartDate={plan.weekStartDate}
                      pending={pending}
                      onCancel={() => setEditingItem(null)}
                      onSubmit={(value) =>
                        mutation(`${endpoint}/${plan.id}/items/${item.id}`, 'PATCH', value)
                      }
                    />
                  ) : (
                    <>
                      <strong>{item.scheduledDate}</strong>{' '}
                      {pillars.find((pillar) => pillar.id === item.contentPillarId)?.title ??
                        '利用できないContent Pillar'}
                      <p>
                        {item.goal} — {item.angle}（{item.recommendedFormat}）
                      </p>
                      {item.notes ? <p>{item.notes}</p> : null}
                      {editable ? (
                        <div className="weekly-plan-actions">
                          <button
                            disabled={pending}
                            type="button"
                            onClick={() => setEditingItem(item.id)}
                          >
                            編集
                          </button>
                          <button
                            disabled={pending}
                            type="button"
                            onClick={() => {
                              if (window.confirm('この予定を削除しますか？'))
                                void mutation(`${endpoint}/${plan.id}/items/${item.id}`, 'DELETE');
                            }}
                          >
                            削除
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {addingTo === plan.id ? (
              <ItemForm
                initial={emptyItem(plan)}
                pillars={pillars}
                weekStartDate={plan.weekStartDate}
                pending={pending}
                onCancel={() => setAddingTo(null)}
                onSubmit={(value) => mutation(`${endpoint}/${plan.id}/items`, 'POST', value)}
              />
            ) : null}
            {editable ? (
              <div className="weekly-plan-actions">
                <button
                  disabled={pending || activePillars.length === 0}
                  type="button"
                  onClick={() => setAddingTo(plan.id)}
                >
                  予定を追加
                </button>
                <button
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    if (window.confirm('確定後は編集できません。確定しますか？'))
                      void mutation(`${endpoint}/${plan.id}/confirm`, 'POST', {});
                  }}
                >
                  Planを確定
                </button>
                <button
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    if (window.confirm('自動失効ではありません。このPlanを失効しますか？'))
                      void mutation(`${endpoint}/${plan.id}/expire`, 'POST', {});
                  }}
                >
                  Planを失効
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
      {capabilityStatus === 'ACTIVE' && !creating ? (
        <button disabled={pending} type="button" onClick={() => setCreating(true)}>
          新しいDRAFT Plan
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
            Timezone（保存前に確認してください）
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
      <p>同じ週に1 Plan、同じ日には1件だけ登録できます。失効したPlanは再利用できません。</p>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
