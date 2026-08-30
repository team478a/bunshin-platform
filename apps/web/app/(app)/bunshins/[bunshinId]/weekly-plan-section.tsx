'use client';

import { SOCIAL_PREFERRED_FORMATS, type SocialPreferredFormat } from '@bunshin/capability-social';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { SocialCapabilityStatus } from './capability-section';
import type { ContentPillarView } from './content-pillar-section';
import type { SocialProfileView } from './social-profile-section';

const platformLabels: Record<SocialProfileView['platform'], string> = {
  INSTAGRAM: 'インスタグラム',
  TIKTOK: 'ティックトック',
  X: 'X（旧ツイッター）',
  THREADS: 'スレッズ',
  YOUTUBE_SHORTS: 'ユーチューブ ショート',
  OTHER: 'その他',
};

export interface WeeklyPlanItemView {
  id: string;
  scheduledDate: string;
  contentPillarId: string;
  goal: string;
  angle: string;
  recommendedFormat: SocialPreferredFormat;
  notes: string | null;
  campaignId?: string | null;
  classification?: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
}

export interface WeeklyPlanView {
  id: string;
  weekStartDate: string;
  timezone: string;
  strategySummary: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'EXPIRED';
  items: WeeklyPlanItemView[];
}

const planStatusLabels: Record<WeeklyPlanView['status'], string> = {
  DRAFT: '作成中',
  CONFIRMED: '決定済み',
  EXPIRED: '終了',
};

const formatLabels: Record<SocialPreferredFormat, string> = {
  TEXT: '文章',
  SLIDE: 'スライド',
  LIVE_ACTION: '自分で撮る動画',
  AI_VIDEO_PROMPT: 'AI動画の作り方',
  IMAGE: '画像',
};

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
        投稿テーマ
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
            <option key={format} value={format}>
              {formatLabels[format]}
            </option>
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
      <h2>1週間の投稿予定</h2>
      <p>BUNSHINが、決めたSNSと投稿テーマを使って、1週間分の予定を考えます。</p>
      {capabilityStatus === null ? <p>先に「SNSのお手伝いをはじめる」を押してください。</p> : null}
      {readonly ? <p>今は予定を見ることだけできます。内容を変えることはできません。</p> : null}
      {plans.length === 0 ? <p>1週間の投稿予定はまだありません。</p> : null}
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
          <h3>BUNSHINに1週間の予定を考えてもらう</h3>
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
      {plans.map((plan) => {
        const actionable = capabilityStatus === 'ACTIVE' && plan.status === 'DRAFT';
        const editable = actionable && !managedGenerationOnly;
        return (
          <article className="weekly-plan-card" key={plan.id}>
            <h3>
              {plan.weekStartDate}〜{addDays(plan.weekStartDate, 6)}{' '}
              <small>{planStatusLabels[plan.status]}</small>
            </h3>
            <p>地域の時間：{plan.timezone}</p>
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
            {plan.status !== 'DRAFT' ? <p>決めた後や終了した予定は編集できません。</p> : null}
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
                        '使えない投稿テーマ'}
                      <p>
                        {item.goal} — {item.angle}（{formatLabels[item.recommendedFormat]}）
                      </p>
                      {item.classification && item.classification !== 'ORGANIC' ? (
                        <p>
                          {item.classification === 'ADVERTISEMENT'
                            ? '商品を紹介する企画（PR）'
                            : '商品に関係する企画'}
                        </p>
                      ) : null}
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
            {actionable ? (
              <div className="weekly-plan-actions">
                {!managedGenerationOnly ? (
                  <button
                    disabled={pending || activePillars.length === 0}
                    type="button"
                    onClick={() => setAddingTo(plan.id)}
                  >
                    予定を追加
                  </button>
                ) : null}
                <button
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    if (window.confirm('確定後は編集できません。確定しますか？'))
                      void mutation(`${endpoint}/${plan.id}/confirm`, 'POST', {});
                  }}
                >
                  この予定に決める
                </button>
                <button
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    if (window.confirm('この1週間の予定を終了しますか？'))
                      void mutation(`${endpoint}/${plan.id}/expire`, 'POST', {});
                  }}
                >
                  この予定を終了する
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
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
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
