'use client';
import { useRef, useState } from 'react';
import type { FeedbackReviewCommand } from '../../../../../src/services/improvement-feedback-review';

type TerminalState = 'RECORDED' | 'RELOAD_REQUIRED' | null;

export function feedbackReviewButtonLabel({
  done,
  busy,
  uncertain,
  prepared,
}: {
  done: TerminalState;
  busy: boolean;
  uncertain: boolean;
  prepared: boolean;
}) {
  if (done === 'RECORDED') return '記録済み';
  if (done === 'RELOAD_REQUIRED') return '画面更新が必要';
  if (busy) return '確認中…';
  if (uncertain) return '同じ内容で再送';
  return prepared ? '判断を確定' : '確認を始める';
}

export function FeedbackReviewControl({
  endpoint,
  selectionHandle,
}: {
  endpoint: string;
  selectionHandle: string;
}) {
  const [handle, setHandle] = useState<string | null>(null);
  const [reason, setReason] = useState('REVIEW_COMPLETED');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<TerminalState>(null);
  const [message, setMessage] = useState('');
  const pending = useRef<FeedbackReviewCommand | null>(null);
  const sending = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  async function send() {
    if (sending.current || done) return;
    sending.current = true;
    setBusy(true);
    const command: FeedbackReviewCommand =
      pending.current ??
      (handle === null
        ? { action: 'PREPARE', handle: selectionHandle }
        : reason === 'REVIEW_COMPLETED'
          ? {
              action: 'MARK_REVIEWED',
              handle,
              reasonCode: 'REVIEW_COMPLETED',
              confirmation: 'RECORD_REVIEW',
            }
          : {
              action: 'DISMISS',
              handle,
              reasonCode: reason === 'OUT_OF_SCOPE' ? 'OUT_OF_SCOPE' : 'DUPLICATE_REVIEW',
              confirmation: 'RECORD_REVIEW',
            });
    pending.current = command;
    setUncertain(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
      });
      if (!response.ok) {
        if ([400, 401, 403, 404, 409].includes(response.status)) {
          setDone('RELOAD_REQUIRED');
          setMessage(
            '確認条件が変わったか期限切れです。保存成功とは判定していません。画面を更新してください。',
          );
          return;
        }
        throw new Error('review response unavailable');
      }
      const json = (await response.json()) as { data?: { state?: string; handle?: string | null } };
      if (
        command.action === 'PREPARE' &&
        json.data?.state === 'OPEN' &&
        typeof json.data.handle === 'string'
      ) {
        setHandle(json.data.handle);
        pending.current = null;
        setUncertain(false);
        setMessage('確認内容を選び、チェックを入れて確定してください。');
      } else if (['REVIEWED', 'DISMISSED'].includes(json.data?.state ?? '')) {
        setDone('RECORDED');
        setMessage(
          json.data?.state === 'REVIEWED'
            ? '確認済みとして記録されています。修正完了・開発承認ではありません。'
            : '対象外として記録されています。原本報告は削除しません。',
        );
      } else throw new Error('invalid review response');
    } catch {
      setMessage('結果を確認できませんでした。同じ内容で再送できます。判断内容は変更しません。');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <div>
      {handle && !done && (
        <fieldset disabled={busy || uncertain}>
          <legend>人手確認の記録</legend>
          <label>
            判断
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="REVIEW_COMPLETED">確認済みにする</option>
              <option value="OUT_OF_SCOPE">改善対象外として見送る</option>
              <option value="DUPLICATE_REVIEW">他の確認と重複している</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            原本を削除せず、人手確認の判断だけを記録します
          </label>
        </fieldset>
      )}
      <button
        type="button"
        disabled={busy || done !== null || (!!handle && !confirmed)}
        onClick={() => {
          void send();
        }}
      >
        {feedbackReviewButtonLabel({ done, busy, uncertain, prepared: handle !== null })}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
