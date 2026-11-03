'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  submitBroadcastHistoryAction,
  type BroadcastHistoryAction,
} from './broadcast-history-action-client';
import type {
  ServiceLineBroadcastHealth,
  ServiceLineBroadcastOperationalStatus,
  ServiceLineBroadcastView,
} from './service-line-broadcast-types';

const statusLabels: Record<ServiceLineBroadcastOperationalStatus, string> = {
  HEALTHY: '正常',
  SCHEDULED: '予約中',
  STALLED: '配信停滞',
  NEEDS_ATTENTION: '再送確認',
  RECOVERED: '自動回復済み',
  CANCELLED: '取消済み',
};

export function ServiceLineBroadcastHistory({
  serviceSlug,
  serviceName,
  unavailable,
  broadcasts,
  health,
  reload,
  announce,
}: {
  serviceSlug: string;
  serviceName: string;
  unavailable: boolean;
  broadcasts: ServiceLineBroadcastView[];
  health: ServiceLineBroadcastHealth;
  reload: () => Promise<boolean>;
  announce: (message: string) => void;
}) {
  const [review, setReview] = useState<{
    action: BroadcastHistoryAction;
    broadcast: ServiceLineBroadcastView;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (review) heading.current?.focus();
    else trigger.current?.focus();
  }, [review]);

  function prepare(
    action: BroadcastHistoryAction,
    broadcast: ServiceLineBroadcastView,
    button: HTMLButtonElement,
  ) {
    if (lock.current || review || unavailable) return;
    trigger.current = button;
    setReason('');
    setReview({ action, broadcast: { ...broadcast, recipients: { ...broadcast.recipients } } });
    announce('対象の配信と理由を確認してください。まだ実行していません。');
  }
  async function refresh() {
    // Reading history never resubmits an uncertain mutation.
    try {
      if (await reload()) return true;
    } catch {
      // Keep the known mutation outcome separate from the history read failure.
    }
    return false;
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !review || uncertain || unavailable) return;
    const normalized = reason.trim();
    if (!normalized || normalized.length > 1000) {
      announce('理由を1〜1000文字で入力してください。');
      return;
    }
    lock.current = true;
    setBusy(true);
    announce('操作を処理しています…');
    const result = await submitBroadcastHistoryAction(
      serviceSlug,
      review.broadcast.id,
      review.action,
      normalized,
    );
    if (result === 'UNKNOWN') {
      setUncertain(true);
      announce('実行結果を確認できません。繰り返し実行せず、配信履歴だけを再取得してください。');
    } else {
      const action = review.action;
      setReview(null);
      const loaded = await refresh();
      announce(
        result === 'REJECTED'
          ? `操作は受理されませんでした。現在の配信状態と権限を確認してください。${loaded ? '' : '履歴を取得できませんでした。'}`
          : `${action === 'retry' ? '失敗した宛先への再送予約が完了しました。' : '配信予約の取消が完了しました。'}${loaded ? '' : '履歴を取得できませんでした。操作を再実行せず、履歴だけを再取得してください。'}`,
      );
    }
    lock.current = false;
    setBusy(false);
  }
  async function inspectResult() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    if (await refresh()) {
      setReview(null);
      setUncertain(false);
      announce(
        '最新の履歴を取得しました。操作の成否は確定できていません。対象の配信状態を確認してください。',
      );
    } else {
      announce('履歴を取得できません。操作を繰り返さず、履歴の再取得をお試しください。');
    }
    lock.current = false;
    setBusy(false);
  }
  return (
    <>
      <div className="line-broadcast-summary" aria-label="配信の運用状況">
        <span>
          配信停滞 <strong>{health.stalledBroadcasts}件</strong>
        </span>
        <span>
          失敗宛先 <strong>{health.failedRecipients}件</strong>
        </span>
        <span>
          失敗率 <strong>{health.failureRate}%</strong>
        </span>
        <span>
          自動回復 <strong>{health.recoveryAttempts}件</strong>
        </span>
      </div>
      {health.stalledBroadcasts > 0 ? (
        <p className="line-broadcast-alert" role="alert">
          送信予定から15分以上進んでいない配信があります。最近の配信を確認してください。
        </p>
      ) : null}
      <h3>最近の配信</h3>
      <p>
        <a href={`/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/export`}>
          配信結果をCSVでダウンロード
        </a>
      </p>
      <ul className="line-broadcast-list">
        {broadcasts.map((broadcast) => (
          <li key={broadcast.id}>
            <div className="line-broadcast-list__detail">
              <strong>{broadcast.title}</strong>
              <span
                className={`line-broadcast-state line-broadcast-state--${broadcast.operationalStatus.toLowerCase()}`}
              >
                {statusLabels[broadcast.operationalStatus]}
              </span>
              <small>
                送信 {broadcast.recipients.SENT ?? 0}件／失敗 {broadcast.recipients.FAILED ?? 0}
                件／失敗率 {broadcast.failureRate}%
                {broadcast.recoveryAttempts > 0 ? `／自動回復 ${broadcast.recoveryAttempts}回` : ''}
              </small>
            </div>
            {broadcast.status === 'COMPLETED' && (broadcast.recipients.FAILED ?? 0) > 0 ? (
              <button
                className="button button--secondary"
                type="button"
                disabled={review !== null || busy || unavailable}
                onClick={(event) => prepare('retry', broadcast, event.currentTarget)}
              >
                失敗分を再送する
              </button>
            ) : null}
            {broadcast.status === 'SCHEDULED' ? (
              <button
                className="button button--secondary"
                type="button"
                disabled={review !== null || busy || unavailable}
                onClick={(event) => prepare('cancel', broadcast, event.currentTarget)}
              >
                配信を取り消す
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {review ? (
        <section className="card stack" aria-label="配信操作の最終確認">
          <h3 ref={heading} tabIndex={-1}>
            {review.action === 'retry' ? '失敗分の再送を確認' : '配信予約の取消を確認'}
          </h3>
          <dl>
            <dt>サービス</dt>
            <dd>{serviceName}</dd>
            <dt>配信件名</dt>
            <dd>{review.broadcast.title}</dd>
            <dt>配信状態</dt>
            <dd>{statusLabels[review.broadcast.operationalStatus]}</dd>
            {review.broadcast.scheduledAt ? (
              <>
                <dt>送信予定日時</dt>
                <dd>{new Date(review.broadcast.scheduledAt).toLocaleString('ja-JP')}</dd>
              </>
            ) : null}
            <dt>送信済み</dt>
            <dd>{review.broadcast.recipients.SENT ?? 0}件</dd>
            <dt>{review.action === 'retry' ? '失敗分の再送対象' : '未送信の取消対象'}</dt>
            <dd>
              {review.broadcast.recipients[review.action === 'retry' ? 'FAILED' : 'PENDING'] ?? 0}件
            </dd>
          </dl>
          <p>件数は履歴取得時点の値です。実行時に現在の配信状態を再確認します。</p>
          <p>
            {review.action === 'retry'
              ? '失敗した宛先だけに、元の配信内容を再送します。送信済みの宛先は再送されません。LINEのメッセージ通数を使用します。'
              : '未送信の予約を取り消します。送信済みのメッセージは削除されず、実行中の送信は停止できない場合があります。'}
          </p>
          {uncertain ? (
            <>
              <p role="alert">
                結果が不明です。もう一度実行せず、履歴で現在の配信状態を確認してください。
              </p>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={() => void inspectResult()}
              >
                操作せず履歴だけを確認する
              </button>
            </>
          ) : (
            <form className="line-broadcast-form" onSubmit={(event) => void confirm(event)}>
              <label className="field">
                <span className="field__label">
                  {review.action === 'retry' ? '再送する理由' : '取り消す理由'}
                </span>
                <textarea
                  className="field__control"
                  required
                  maxLength={1000}
                  value={reason}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button
                className="button button--secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setReview(null);
                  announce('操作せずに戻りました。');
                }}
              >
                実行せず戻る
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={busy || unavailable}
              >
                {review.action === 'retry' ? '失敗分だけ再送を予約する' : '未送信の予約を取り消す'}
              </button>
            </form>
          )}
        </section>
      ) : null}
    </>
  );
}
