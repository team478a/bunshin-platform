'use client';
import { useRef, useState } from 'react';
import type { PilotOperation } from '@bunshin/application';
import {
  availablePilotOperation,
  createPilotOperationCommand,
  pilotOperationsSnapshot,
  submitPilotOperation,
  type PilotOperationsSnapshot,
} from './pilot-operations-client';

const startChecks = [
  '3件の学習Definitionが運営者により承認済み',
  '内部参加者1〜3名のEnrollment・Seatが準備済み',
  '各内部参加者の本人Profileが準備済み',
  '対象Programと一致するCall Admission・価格設定を確認済み',
  'PERSONAL_LEARNING_PILOT / PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT がOFF',
  'DEFINITION_ADMIN / PROFILE_PREPARATION / PARTICIPANT_PREPARATION の各準備flagがOFF',
];

export function PilotOperationsCard({ serviceSlug }: { serviceSlug: string }) {
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/pilot-operations`;
  const [snapshot, setSnapshot] = useState<PilotOperationsSnapshot | null>(null);
  const [evidence, setEvidence] = useState('');
  const [checks, setChecks] = useState<boolean[]>(startChecks.map(() => false));
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('まず現在の状態を確認してください。');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const pending = useRef<PilotOperation | null>(null);
  const lock = useRef(false);

  async function refresh() {
    if (lock.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const body = (await response.json()) as { data?: unknown };
      const current = pilotOperationsSnapshot(body.data);
      if (!current) throw new Error('invalid receipt');
      setSnapshot(current);
      setEvidence('');
      setConfirmed(false);
      setChecks(startChecks.map(() => false));
      const action = availablePilotOperation(current);
      setMessage(
        action === 'STOP'
          ? '開始済みです。停止はPilot実行flagがONでも実行できます。'
          : action === 'START'
            ? '停止中・未開始です。開始前提を確認してください。'
            : action === 'INITIALIZE'
              ? 'Programはありますが未初期化です。対象と初期化内容を確認してください。'
              : '操作可能な状態ではありません。',
      );
    } catch {
      setSnapshot(null);
      setMessage('状態を確認できませんでした。権限・運用設定を確認してください。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function submit(action: 'INITIALIZE' | 'START' | 'STOP') {
    if (lock.current) return;
    const allStartChecks = action !== 'START' || checks.every(Boolean);
    const acknowledged = action === 'START' ? allStartChecks : confirmed;
    const command =
      pending.current ?? createPilotOperationCommand(snapshot, action, evidence, acknowledged);
    if (!command) return;
    pending.current = command;
    lock.current = true;
    setBusy(true);
    setRetry(false);
    const result = await submitPilotOperation(endpoint, command);
    lock.current = false;
    setBusy(false);
    if (result.result === 'RETRY') {
      setRetry(true);
      setMessage('結果を確認できません。同じ操作ID・同じ内容で再送して確認してください。');
      return;
    }
    pending.current = null;
    setSnapshot(null);
    setConfirmed(false);
    setChecks(startChecks.map(() => false));
    setMessage(
      result.result === 'SAVED'
        ? action === 'START'
          ? '開始状態を再取得して確認しました。実運用の監視・停止担当はRunbookに従ってください。'
          : action === 'STOP'
            ? '停止状態を再取得して確認しました。送信済みCallのdrain確認は別途必要です。'
            : '初期化状態を再取得して確認しました。開始はしていません。'
        : (result.message ?? '操作を確認できませんでした。状態を再取得してください。'),
    );
  }

  const action = availablePilotOperation(snapshot);
  const evidenceValid = /^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence);
  return (
    <section className="card stack">
      <h2>Wave 0の初期化・開始・停止</h2>
      <p>
        変更前に最新状態を取得します。開始は本番開始承認ではありません。STOPは実行flagの状態に関係なく操作できますが、送信済み処理の取消・drain完了を保証しません。
      </p>
      <p role="status">{message}</p>
      <button type="button" disabled={busy || retry} onClick={() => void refresh()}>
        現在の状態を確認
      </button>
      {snapshot && (
        <p>
          Program: {snapshot.exists ? 'あり' : 'なし'} / 状態: {snapshot.status} / 初期化:
          {snapshot.initialized ? '済み' : '未'} / 開始履歴: {snapshot.started ? 'あり' : 'なし'} /
          実行: {snapshot.enabled ? 'ON' : 'OFF'}
        </p>
      )}
      {action === 'INITIALIZE' && (
        <>
          <p>
            初期化は既存ProgramをWave
            0用の停止状態に準備します。Definition承認や参加者登録は行いません。
          </p>
          <label>
            人間レビュー記録の識別子（本文・秘密情報は入力しない）
            <input
              value={evidence}
              maxLength={100}
              disabled={busy || retry}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || retry}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            対象Service・Programと停止状態での初期化を確認しました
          </label>
          <button
            type="button"
            disabled={busy || retry || !confirmed || !evidenceValid}
            onClick={() => void submit('INITIALIZE')}
          >
            停止状態で初期化
          </button>
        </>
      )}
      {action === 'START' && (
        <>
          <p>
            開始操作の前提を一つずつ確認してください。条件に不足があればサーバー側で拒否されます。
          </p>
          {startChecks.map((label, index) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={checks[index] ?? false}
                disabled={busy || retry}
                onChange={(e) =>
                  setChecks((current) =>
                    current.map((value, i) => (i === index ? e.target.checked : value)),
                  )
                }
              />
              {label}
            </label>
          ))}
          <label>
            人間レビュー記録の識別子（本文・秘密情報は入力しない）
            <input
              value={evidence}
              maxLength={100}
              disabled={busy || retry}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || retry || !checks.every(Boolean) || !evidenceValid}
            onClick={() => void submit('START')}
          >
            Wave 0を開始
          </button>
        </>
      )}
      {action === 'STOP' && (
        <>
          <p>
            緊急停止です。実行flagがONでも停止を受け付けます。処理中Callは別途drain状況を確認してください。
          </p>
          <label>
            停止レビュー記録の識別子
            <input
              value={evidence}
              maxLength={100}
              disabled={busy || retry}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || retry}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            対象Programを停止することを確認しました
          </label>
          <button
            type="button"
            disabled={busy || retry || !confirmed || !evidenceValid}
            onClick={() => void submit('STOP')}
          >
            緊急停止
          </button>
        </>
      )}
      {retry && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const pendingAction = pending.current?.action;
            if (
              pendingAction === 'INITIALIZE' ||
              pendingAction === 'START' ||
              pendingAction === 'STOP'
            )
              void submit(pendingAction);
          }}
        >
          同じ操作を再送して確認
        </button>
      )}
    </section>
  );
}
