'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ServiceLineBroadcastHistory } from './service-line-broadcast-history';
import type {
  ServiceLineBroadcastHealth,
  ServiceLineBroadcastView,
} from './service-line-broadcast-types';

import {
  broadcastCommand,
  broadcastEndpoint,
  parseBroadcastDraft,
  previewBroadcast,
  submitBroadcast,
  type BroadcastCommand,
} from './broadcast-confirmation-client';

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

type EditorProps = {
  serviceSlug: string;
  serviceName?: string;
  initialTitle?: string;
  initialMessage?: string;
  initialReason?: string;
  templates?: LineTemplate[];
};
export function ServiceLineBroadcastEditor(props: EditorProps) {
  return <BroadcastSession key={props.serviceSlug} {...props} />;
}
function BroadcastSession({
  serviceName = 'このサービス',
  serviceSlug,
  initialTitle = '',
  initialMessage = '',
  initialReason = '',
  templates = [],
}: EditorProps) {
  const [sending, setSending] = useState(false);
  const scheduleHelpId = useId();
  const [message, setMessage] = useState('');
  const [broadcasts, setBroadcasts] = useState<ServiceLineBroadcastView[]>([]);
  const [health, setHealth] = useState<ServiceLineBroadcastHealth>(emptyHealth);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [industryId, setIndustryId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [review, setReview] = useState<BroadcastCommand | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const historyGeneration = useRef(0);
  const [reason, setReason] = useState(initialReason);
  const [scheduledAt, setScheduledAt] = useState('');
  const lock = useRef(false);
  const pending = useRef<BroadcastCommand | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialMessage);
  const load = async () => {
    const generation = ++historyGeneration.current;
    try {
      const response = await fetch(broadcastEndpoint(serviceSlug), {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('history unavailable');
      const result = (await response.json()) as {
        data: ServiceLineBroadcastView[];
        health?: ServiceLineBroadcastHealth;
        options?: { industries?: Industry[] };
      };
      if (!Array.isArray(result.data)) throw new Error('invalid history');
      if (generation !== historyGeneration.current) return true;
      setBroadcasts(result.data);
      setHealth(result.health ?? emptyHealth);
      setIndustries(result.options?.industries ?? []);
      setHistoryReady(true);
      setHistoryUnavailable(false);
      return true;
    } catch {
      if (generation === historyGeneration.current) {
        setHistoryReady(false);
        setHistoryUnavailable(true);
      }
      return false;
    }
  };
  const reload = async () => {
    await load();
  };
  useEffect(() => {
    void reload();
  }, [serviceSlug]);
  const segment = {
    industryIds: industryId ? [industryId] : [],
    purposes: purpose ? [purpose] : [],
  };
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || review || pending.current) return;
    let iso: string | undefined;
    try {
      if (scheduledAt) iso = new Date(scheduledAt).toISOString();
    } catch {
      setMessage('送信予定を確認してください。');
      return;
    }
    const draft = parseBroadcastDraft({
      title,
      message: body,
      reason,
      segment,
      ...(iso ? { scheduledAt: iso } : {}),
    });
    if (!draft) {
      setMessage('件名・本文・理由・送信予定を確認してください。');
      return;
    }
    lock.current = true;
    setSending(true);
    setMessage('送信対象を確認しています…');
    try {
      const preview = await previewBroadcast(serviceSlug, draft);
      if (!preview) {
        setMessage(
          '送信対象を確認できませんでした。権限や接続状態を確認してから、もう一度お試しください。',
        );
        return;
      }
      if (preview.capped) {
        setMessage('送信対象が500人を超えています。条件を絞ってください。');
        return;
      }
      if (preview.eligibleRecipientCount < 1) {
        setMessage('条件に合う送信対象がいません。条件を変更してください。');
        return;
      }
      setReview(broadcastCommand(draft, preview.eligibleRecipientCount));
      setMessage('下の送信内容を確認し、予約を確定してください。まだ配信は予約されていません。');
    } catch {
      setMessage('送信対象を確認できませんでした。もう一度お試しください。');
    } finally {
      lock.current = false;
      setSending(false);
    }
  }
  async function confirm() {
    if (lock.current) return;
    const command = pending.current ?? review;
    if (!command) return;
    pending.current = command;
    lock.current = true;
    setSending(true);
    setMessage('配信を予約しています…');
    const result = await submitBroadcast(serviceSlug, command);
    if (result.kind === 'UNKNOWN') {
      setUncertain(true);
      setMessage(
        '予約結果を確認できません。同じ予約だけを再送して確認してください。新しい予約は作成しないでください。',
      );
      lock.current = false;
      setSending(false);
      return;
    }
    pending.current = null;
    setUncertain(false);
    setReview(null);
    if (result.kind === 'REJECTED') {
      setMessage(
        '予約は受理されませんでした。対象人数や権限・接続状態を確認し、内容確認からやり直してください。',
      );
    } else {
      setTitle('');
      setBody('');
      setReason('');
      setScheduledAt('');
      setIndustryId('');
      setPurpose('');
      const loaded = await load();
      setMessage(
        `予約の登録結果を確認しました。対象 ${result.receipt.requested}人。${loaded ? '配信状況は履歴で確認してください。' : '履歴を取得できませんでした。予約を再送せず、履歴だけを再取得してください。'}`,
      );
    }
    lock.current = false;
    setSending(false);
  }
  return (
    <section className="settings-card line-broadcast-editor">
      <p className="eyebrow">参加者へのお知らせ</p>
      <h2>任意のお知らせを一斉配信</h2>
      <p>LINE連携・通知同意・友だち追加が確認できた、このサービスの参加者だけに送ります。</p>
      {review === null ? (
        <form className="line-broadcast-form" onSubmit={(event) => void prepare(event)}>
          <fieldset className="line-broadcast-draft" disabled={sending}>
            <legend>配信内容を入力</legend>
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
              <p>次の確認画面で現在の対象人数を自動確認します。</p>
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
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  maxLength={1000}
                  placeholder="例：公式のお知らせ"
                />
              </label>
              <label className="field">
                <span className="field__label">送信予定</span>
                <input
                  className="field__control"
                  name="scheduledAt"
                  aria-label="送信予定"
                  aria-describedby={scheduleHelpId}
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
                <small id={scheduleHelpId}>空欄の場合は、確認後すぐに送信します。</small>
              </label>
            </div>
            <button
              className="button line-broadcast-form__submit"
              disabled={sending || review !== null}
              type="submit"
            >
              {sending ? '確認中…' : '送信内容を確認する'}
            </button>
          </fieldset>
        </form>
      ) : null}
      {review ? (
        <section className="card stack" aria-label="送信内容の最終確認">
          <h3>送信内容の最終確認</h3>
          <dl>
            <dt>送信先サービス</dt>
            <dd>{serviceName}</dd>
            <dt>業種</dt>
            <dd>
              {review.segment.industryIds.length
                ? (industries.find((i) => i.id === review.segment.industryIds[0])?.name ??
                  '選択した業種')
                : 'すべての業種'}
            </dd>
            <dt>主な目的</dt>
            <dd>
              {purposeOptions.find((i) => i[0] === review.segment.purposes[0])?.[1] ??
                'すべての目的'}
            </dd>
            <dt>送信対象</dt>
            <dd>{review.expectedRecipientCount}人</dd>
            <dt>件名</dt>
            <dd>{review.title}</dd>
            <dt>本文</dt>
            <dd className="line-broadcast-confirmation__body">{review.message}</dd>
            <dt>送信予定</dt>
            <dd>
              {review.scheduledAt
                ? new Date(review.scheduledAt).toLocaleString('ja-JP')
                : '確認後すぐに配信'}
            </dd>
            <dt>送信理由</dt>
            <dd>{review.reason}</dd>
          </dl>
          <p>
            このサービスの参加者のうち、LINE連携・通知同意・友だち追加を確認できた方が対象です。確定時に対象人数を再確認します。
          </p>
          <p>LINEのメッセージ通数を使用します。送信後は取り消せません。</p>
          {!uncertain ? (
            <>
              <button
                type="button"
                className="button button--secondary"
                disabled={sending}
                onClick={() => {
                  setReview(null);
                  setMessage('内容を修正した後、もう一度確認してください。');
                }}
              >
                戻って修正する
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={sending}
                onClick={() => void confirm()}
              >
                この内容で送信を予約する
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="button button--secondary"
                disabled={sending}
                onClick={() => void confirm()}
              >
                同じ予約の結果を確認する
              </button>
              <p>
                ページを離れると再送情報は失われます。再読込後は配信履歴を確認し、結果不明のまま新しく予約しないでください。
              </p>
            </>
          )}
        </section>
      ) : null}
      <p className="line-broadcast-status" aria-live="polite" role="status">
        {message}
      </p>
      {historyUnavailable ? (
        <p role="alert">
          履歴を取得できません。
          <button
            type="button"
            className="button button--secondary"
            disabled={sending}
            onClick={() => void reload()}
          >
            配信履歴を再取得する
          </button>
        </p>
      ) : null}
      {historyReady ? (
        <ServiceLineBroadcastHistory
          serviceSlug={serviceSlug}
          broadcasts={broadcasts}
          health={health}
          reload={reload}
          announce={setMessage}
        />
      ) : null}
    </section>
  );
}
