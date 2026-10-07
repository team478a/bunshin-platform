'use client';
import { useRef, useState } from 'react';
import type { PilotOperation } from '@bunshin/application';
import {
  createPreparationCommand,
  preparationSnapshot,
  submitPreparation,
  type PreparationSnapshot,
} from './client';

export function ProgramPreparationCard({
  serviceSlug,
  programId,
}: {
  serviceSlug: string;
  programId: string;
}) {
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/pilot-operations`;
  const [snapshot, setSnapshot] = useState<PreparationSnapshot | null>(null);
  const [evidence, setEvidence] = useState('');
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
    setSnapshot(null);
    setConfirmed(false);
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const body = (await response.json()) as { data?: unknown };
      const current = preparationSnapshot(body.data);
      if (!current) throw new Error('invalid receipt');
      setSnapshot(current);
      setMessage(
        current.exists
          ? '対象Programはすでに存在します。この画面では変更しません。'
          : '未作成です。対象と作成内容を確認してください。',
      );
    } catch {
      setMessage('状態を確認できませんでした。権限・準備設定を確認してから再確認してください。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (lock.current) return;
    const command = pending.current ?? createPreparationCommand(snapshot, evidence, confirmed);
    if (!command) return;
    pending.current = command;
    lock.current = true;
    setBusy(true);
    setRetry(false);
    const result = await submitPreparation(endpoint, command);
    lock.current = false;
    setBusy(false);
    if (result === 'RETRY') {
      setRetry(true);
      setMessage('結果を確認できません。同じ操作を再送して確認してください。内容は変更しません。');
      return;
    }
    pending.current = null;
    setSnapshot(null);
    setConfirmed(false);
    setMessage(
      result === 'SAVED'
        ? '期限なし専用Programを停止状態で準備しました。学習・参加者登録・通知は開始していません。'
        : '作成は確認できませんでした。状態を再確認してください。',
    );
  }
  return (
    <section className="card stack">
      <h2>期限なし専用Programの準備</h2>
      <p>
        対象Program ID: <span style={{ overflowWrap: 'anywhere' }}>{programId}</span>
      </p>
      <p>
        期限なし・無料・招待制。学習支援のみで、完成品の代行制作はしません。停止状態で作成し、Pilotと通知はOFFのままです。
      </p>
      <p>既存Programは上書きしません。Definition承認・参加者登録・Pilot開始は別操作です。</p>
      <p role="status">{message}</p>
      <button type="button" disabled={busy || retry} onClick={() => void refresh()}>
        現在の状態を確認
      </button>
      {snapshot && !snapshot.exists && snapshot.status === 'ABSENT' && !snapshot.enabled && (
        <>
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
            対象Service・Programと停止状態での作成を確認しました
          </label>
          <button
            type="button"
            disabled={busy || retry || !confirmed || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence)}
            onClick={() => void submit()}
          >
            停止状態で作成
          </button>
        </>
      )}
      {retry && (
        <button type="button" disabled={busy} onClick={() => void submit()}>
          同じ操作を再送して確認
        </button>
      )}
      {retry && (
        <p>
          ページを離れると再送情報は失われます。再読み込みした場合は状態確認のみを行い、不明なまま新規操作を繰り返さないでください。
        </p>
      )}
    </section>
  );
}
