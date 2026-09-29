'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TRAINING_ENROLLMENT_STATUS_LABELS,
  type TrainingEndDateResult,
} from '@bunshin/capability-training';
import { trainingEndDateFromJst } from '../../../../../src/services/ai-training-end-date-input';
import type { TrainingLifecycleRow } from './training-lifecycle-card';

type Preview = Extract<TrainingEndDateResult, { outcome: 'PREVIEW' }>['preview'];
export function TrainingEndDateCard({
  serviceSlug,
  row,
}: {
  serviceSlug: string;
  row: TrainingLifecycleRow;
}) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [operationId, setOperationId] = useState<string | null>(null);
  if (
    row.endedAt ||
    (row.status === 'EXPIRED' && row.endsAt) ||
    !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(row.status)
  )
    return null;
  function reset() {
    setPreview(null);
    setConfirmed(false);
    setOperationId(null);
    setMessage('');
  }
  async function send(mode: 'PREVIEW' | 'CONFIRM') {
    const endedAt = trainingEndDateFromJst(date);
    if (!endedAt || !reason.trim() || busy || (mode === 'CONFIRM' && (!preview || !confirmed)))
      return;
    setBusy(true);
    setMessage('');
    const id = operationId ?? crypto.randomUUID();
    if (mode === 'CONFIRM') setOperationId(id);
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/enrollments/${encodeURIComponent(row.enrollmentId)}/end-date`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode,
            endedAt,
            reason: reason.trim(),
            ...(mode === 'CONFIRM'
              ? {
                  revision: preview?.revision,
                  operationId: id,
                  confirmation: 'CONFIRM_TRAINING_END_DATE',
                }
              : {}),
          }),
        },
      );
      const result = (await response.json()) as { data?: TrainingEndDateResult };
      if (!response.ok || !result.data) {
        setPreview(null);
        setConfirmed(false);
        setOperationId(null);
        setMessage(
          response.status === 409
            ? '状態が変更されたか、終了日時が既に確定しています。更新して再確認してください。'
            : response.status === 400
              ? '終了日時と理由を確認してください。未来・開始前の日時は指定できません。'
              : '確認・確定できませんでした。権限と対象を確認してください。',
        );
        if (response.status === 409) router.refresh();
        return;
      }
      if (result.data.outcome === 'PREVIEW') {
        setPreview(result.data.preview);
        setConfirmed(false);
        setOperationId(null);
      } else if (result.data.outcome === 'APPLIED' || result.data.outcome === 'ALREADY_APPLIED') {
        reset();
        setDate('');
        setReason('');
        setMessage('終了日時を確定しました。データ削除は行っていません。');
        router.refresh();
      }
    } catch {
      setMessage('通信に失敗しました。同じ操作を再試行できます。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-form" aria-label="過去の終了日時の確定">
      <h4>過去の終了日時を確認して確定</h4>
      <p>証跡を確認できた日時だけを指定してください。自動推定・一括補完は行いません。</p>
      <p>
        保持期限の起算日になります。この操作で学習情報・Toolkitを削除せず、本番の期限処理も開始しません。
      </p>
      <label>
        確認した終了日時（日本時間）
        <input
          type="datetime-local"
          value={date}
          disabled={busy}
          onChange={(e) => {
            setDate(e.target.value);
            reset();
          }}
        />
      </label>
      <label>
        根拠・理由（個人情報・回答本文を含めないでください）
        <textarea
          maxLength={300}
          value={reason}
          disabled={busy}
          onChange={(e) => {
            setReason(e.target.value);
            reset();
          }}
        />
      </label>
      <button
        type="button"
        className="button button--secondary"
        disabled={busy || !trainingEndDateFromJst(date) || !reason.trim()}
        onClick={() => void send('PREVIEW')}
      >
        確定前に確認
      </button>
      {preview && (
        <>
          <p>登録状態：{TRAINING_ENROLLMENT_STATUS_LABELS[preview.status]}</p>
          <p>
            確定する終了日時：
            {new Date(preview.endedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </p>
          <p>仕事情報の90日期限：{preview.workInformationDue ? '到来済み' : '未到来'}</p>
          <p>進捗・点数の1年期限：{preview.progressAndScoresDue ? '到来済み' : '未到来'}</p>
          <p>
            期限到来の表示は削除実行の承認ではありません。受講状態・契約期間・課金は変更しません。
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            対象者・証跡・日時と保持期限への影響を確認しました
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || !confirmed}
            onClick={() => void send('CONFIRM')}
          >
            {busy ? '処理中…' : '終了日時を確定'}
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
