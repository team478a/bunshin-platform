'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TRAINING_ENROLLMENT_STATUS_LABELS,
  type TrainingEnrollmentStatus,
  type TrainingLifecycleAction,
} from '@bunshin/capability-training';
import {
  TRAINING_ENROLLMENT_DISPLAY_LABELS,
  type TrainingEnrollmentDisplayStatus,
} from '../../../../../src/services/ai-training-enrollment-display';

export type TrainingLifecycleRow = {
  enrollmentId: string;
  status: TrainingEnrollmentStatus;
  displayStatus: TrainingEnrollmentDisplayStatus;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
  endedAt: string | null;
};
const labels: Record<TrainingLifecycleAction, string> = {
  COMPLETE: '研修を終了',
  CANCEL: '受講を取消',
  REOPEN: '受講を再開',
};
export function TrainingLifecycleCard({
  serviceSlug,
  row,
}: {
  serviceSlug: string;
  row: TrainingLifecycleRow;
}) {
  const router = useRouter();
  const [action, setAction] = useState<TrainingLifecycleAction | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [operationId, setOperationId] = useState<string | null>(null);
  async function apply() {
    if (!action || !confirmed || !reason.trim() || busy) return;
    setBusy(true);
    setMessage('');
    const id = operationId ?? crypto.randomUUID();
    setOperationId(id);
    try {
      const response = await fetch(
        `/api/services/${serviceSlug}/ai-training/enrollments/${row.enrollmentId}/lifecycle`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action,
            expectedStatus: row.status,
            expectedUpdatedAt: row.updatedAt,
            operationId: id,
            reason: reason.trim(),
            confirmation: 'CHANGE_TRAINING_STATUS',
          }),
        },
      );
      const result = (await response.json()) as { data?: { outcome?: string } };
      if (!response.ok) {
        setMessage(
          result.data?.outcome === 'REOPEN_UNAVAILABLE'
            ? '現在の契約期間・参加資格では再開できません。期間延長はこの操作では行いません。'
            : response.status === 409
              ? '状態が変更されました。更新して確認し直してください。'
              : '操作できませんでした。権限と状態を確認してください。',
        );
        setConfirmed(false);
        if (response.status === 409) router.refresh();
        return;
      }
      setMessage('受講状態を変更しました。');
      setAction(null);
      setReason('');
      setConfirmed(false);
      setOperationId(null);
      router.refresh();
    } catch {
      setMessage('通信に失敗しました。同じ操作を再試行できます。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-form">
      <p>利用状況：{TRAINING_ENROLLMENT_DISPLAY_LABELS[row.displayStatus]}</p>
      <p>登録状態：{TRAINING_ENROLLMENT_STATUS_LABELS[row.status]}</p>
      <p>
        予定開始日時：
        {row.startsAt
          ? new Date(row.startsAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
          : '未確定'}
      </p>
      <p>
        予定終了日時：
        {row.endsAt
          ? new Date(row.endsAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
          : '期限の指定なし'}
      </p>
      {row.displayStatus === 'PERIOD_ENDED' && (
        <p>
          受講期間は終了していますが、登録状態は未更新です。終了・取消は理由と確認が必要な別操作です。この表示だけでは確定終了日やデータ保持期限は変更しません。
        </p>
      )}
      {row.displayStatus === 'START_UNRESOLVED' && (
        <p>開始日時が未確定のため、現在は学習操作を利用できません。</p>
      )}
      {(row.displayStatus === 'PERIOD_ENDED' ||
        (row.status !== 'ACTIVE' && row.status !== 'INVITED')) && (
        <p>
          確定終了日時：
          {row.endedAt
            ? new Date(row.endedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : '未確定（過去の終了日は推測しません）'}
        </p>
      )}
      {!action && (
        <div>
          {(row.status === 'ACTIVE'
            ? ['COMPLETE', 'CANCEL']
            : row.status === 'INVITED'
              ? []
              : ['REOPEN']
          ).map((value) => (
            <button
              type="button"
              className="button button--secondary"
              key={value}
              onClick={() => {
                setAction(value as TrainingLifecycleAction);
                setOperationId(null);
                setMessage('');
              }}
            >
              {labels[value as TrainingLifecycleAction]}
            </button>
          ))}
        </div>
      )}
      {action && (
        <>
          <h4>{labels[action]}の確認</h4>
          <p>
            {action === 'REOPEN'
              ? '契約期間内のみ再開できます。削除済みデータは復元せず、評価を自動再投入しません。'
              : '新しい研修課題・通知の対象から外れ、評価待ち処理を停止します。学習データをこの操作で削除しません。'}
          </p>
          <p>課金・返金・契約期間は変更しません。本番の保持期限削除は無効のままです。</p>
          <label>
            操作理由（個人情報・回答本文を含めないでください）
            <textarea
              maxLength={300}
              value={reason}
              disabled={busy}
              onChange={(e) => {
                setReason(e.target.value);
                setOperationId(null);
                setConfirmed(false);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            対象者と変更内容を確認しました
          </label>
          <button
            type="button"
            className="button"
            disabled={!confirmed || !reason.trim() || busy}
            onClick={() => void apply()}
          >
            {busy ? '処理中…' : `${labels[action]}を確定`}
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => {
              setAction(null);
              setConfirmed(false);
              setOperationId(null);
            }}
          >
            戻る
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
