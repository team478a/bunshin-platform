'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ServiceLineBroadcastHistory } from './service-line-broadcast-history';
import type {
  ServiceLineBroadcastHealth,
  ServiceLineBroadcastView,
} from './service-line-broadcast-types';

type Industry = { id: string; name: string };
type LineTemplate = { id: string; name: string; purpose: string; body: string };
const purposeOptions = [
  ['ATTRACT', '集客'],
  ['RESERVATION', '予約'],
  ['SALES', '販売'],
  ['RECRUITING', '採用'],
  ['AWARENESS', '認知'],
  ['RETENTION', '継続'],
] as const;
const emptyHealth: ServiceLineBroadcastHealth = {
  totalBroadcasts: 0,
  stalledBroadcasts: 0,
  broadcastsWithFailures: 0,
  deliveredRecipients: 0,
  failedRecipients: 0,
  recoveryAttempts: 0,
  failureRate: 0,
};

export function ServiceLineBroadcastEditor({
  serviceSlug,
  initialTitle = '',
  initialMessage = '',
  initialReason = '',
  templates = [],
}: {
  serviceSlug: string;
  initialTitle?: string;
  initialMessage?: string;
  initialReason?: string;
  templates?: LineTemplate[];
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [broadcasts, setBroadcasts] = useState<ServiceLineBroadcastView[]>([]);
  const [health, setHealth] = useState<ServiceLineBroadcastHealth>(emptyHealth);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [industryId, setIndustryId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialMessage);
  const load = async () => {
    const response = await fetch(
      `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts`,
    );
    if (response.ok) {
      const result = (await response.json()) as {
        data: ServiceLineBroadcastView[];
        health?: ServiceLineBroadcastHealth;
        options?: { industries?: Industry[] };
      };
      setBroadcasts(result.data);
      setHealth(result.health ?? emptyHealth);
      setIndustries(result.options?.industries ?? []);
    }
  };
  useEffect(() => {
    void load();
  }, [serviceSlug]);
  const segment = {
    industryIds: industryId ? [industryId] : [],
    purposes: purpose ? [purpose] : [],
  };
  async function preview() {
    setMessage('対象者を確認しています…');
    const response = await fetch(
      `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/preview`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(segment),
      },
    );
    const result = (await response.json()) as {
      data?: { eligibleRecipientCount: number; capped: boolean };
      error?: { message?: string };
    };
    if (!response.ok || !result.data) {
      setPreviewCount(null);
      setMessage(result.error?.message ?? '対象者を確認できませんでした。');
      return;
    }
    setPreviewCount(result.data.eligibleRecipientCount);
    setMessage(
      `現在の送信対象は${result.data.eligibleRecipientCount}人です。${result.data.capped ? '上限500人まで表示しています。' : ''}`,
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewCount === null || previewCount < 1) {
      setMessage('先に送信対象を確認してください。');
      return;
    }
    const formData = new FormData(event.currentTarget);
    if (!window.confirm(`対象${previewCount}人と本文を確認しましたか？ LINEを一斉送信します。`))
      return;
    setSending(true);
    setMessage('LINEを送信しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: formData.get('title'),
            message: formData.get('message'),
            reason: formData.get('reason'),
            scheduledAt: formData.get('scheduledAt') || undefined,
            segment,
            expectedRecipientCount: previewCount,
            confirmed: true,
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { requested: number; scheduledAt: string };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? 'LINEを送信できませんでした。');
      setMessage(
        `送信を予約しました。対象 ${result.data?.requested ?? 0}人／予定時刻 ${result.data?.scheduledAt ?? ''}`,
      );
      event.currentTarget.reset();
      setIndustryId('');
      setPurpose('');
      setPreviewCount(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LINEを送信できませんでした。');
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="settings-card">
      <p className="eyebrow">参加者へのお知らせ</p>
      <h2>任意のお知らせを一斉配信</h2>
      <p>LINE連携・通知同意・友だち追加が確認できた、このサービスの参加者だけに送ります。</p>
      <form className="line-broadcast-form" onSubmit={(event) => void submit(event)}>
        {templates.length ? (
          <label className="field line-broadcast-form__wide">
            <span className="field__label">保存済みテンプレートを使う</span>
            <select
              className="field__control"
              defaultValue=""
              onChange={(event) => {
                const template = templates.find((item) => item.id === event.target.value);
                if (!template) return;
                setTitle(template.name);
                setBody(template.body);
              }}
            >
              <option value="">選ばずに入力する</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <fieldset className="line-broadcast-targets">
          <legend>送信対象</legend>
          <p>業種と目的を両方選ぶと、両方に一致する参加者だけが対象になります。</p>
          <div className="line-broadcast-targets__filters">
            <label className="field">
              <span className="field__label">業種</span>
              <select
                className="field__control"
                value={industryId}
                onChange={(event) => {
                  setIndustryId(event.target.value);
                  setPreviewCount(null);
                }}
              >
                <option value="">すべての業種</option>
                {industries.map((industry) => (
                  <option key={industry.id} value={industry.id}>
                    {industry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">主な目的</span>
              <select
                className="field__control"
                value={purpose}
                onChange={(event) => {
                  setPurpose(event.target.value);
                  setPreviewCount(null);
                }}
              >
                <option value="">すべての目的</option>
                {purposeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="line-broadcast-targets__preview">
            <div>
              <span>現在の対象</span>
              <strong>{previewCount === null ? '未確認' : `${previewCount}人`}</strong>
            </div>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void preview()}
            >
              送信対象を確認する
            </button>
          </div>
        </fieldset>
        <div className="line-broadcast-form__fields">
          <label className="field line-broadcast-form__wide">
            <span className="field__label">件名</span>
            <input
              className="field__control"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
              placeholder="例：今週のお知らせ"
            />
          </label>
          <label className="field line-broadcast-form__wide">
            <span className="field__label">本文</span>
            <textarea
              className="field__control line-broadcast-form__message"
              name="message"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              maxLength={5000}
              rows={7}
              placeholder="送信する内容を入力してください"
            />
          </label>
          <label className="field">
            <span className="field__label">送信理由</span>
            <input
              className="field__control"
              name="reason"
              defaultValue={initialReason}
              required
              maxLength={1000}
              placeholder="例：公式のお知らせ"
            />
          </label>
          <label className="field">
            <span className="field__label">送信予定</span>
            <input className="field__control" name="scheduledAt" type="datetime-local" />
            <small>空欄の場合は、確認後すぐに送信します。</small>
          </label>
        </div>
        <button
          className="button line-broadcast-form__submit"
          disabled={sending || previewCount === null || previewCount < 1}
          type="submit"
        >
          {sending ? '予約中…' : '内容を確認して送信を予約する'}
        </button>
      </form>
      <p className="line-broadcast-status" aria-live="polite" role="status">
        {message}
      </p>
      <ServiceLineBroadcastHistory
        serviceSlug={serviceSlug}
        broadcasts={broadcasts}
        health={health}
        reload={load}
        announce={setMessage}
      />
    </section>
  );
}
