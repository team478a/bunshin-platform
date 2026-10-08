'use client';
import { useRef, useState } from 'react';
import {
  internalCommand,
  internalSnapshot,
  internalStep,
  submitInternal,
  type InternalSnapshot,
  type InternalCommand,
} from './internal-client';

export function InternalPreparationCard({ serviceSlug }: { serviceSlug: string }) {
  const [snapshot, setSnapshot] = useState<InternalSnapshot | null>(null);
  const [cap, setCap] = useState('');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState('まず本人の準備状態を確認してください。');
  const lock = useRef(false);
  const pending = useRef<InternalCommand | null>(null);
  const step = internalStep(snapshot);
  async function refresh() {
    if (lock.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    setSnapshot(null);
    setConfirmed(false);
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/internal-preparation`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      if (!response.ok) throw new Error('unavailable');
      const body = (await response.json()) as { data?: unknown };
      const current = internalSnapshot(body.data);
      if (!current) throw new Error('invalid receipt');
      setSnapshot(current);
      setMessage(
        internalStep(current) === 'DONE'
          ? '本人Enrollment・内部参加権は準備済みです。学習はまだ開始しません。'
          : internalStep(current) === 'BLOCKED'
            ? 'この画面では準備できません。停止状態・人数設定・本人の参加状態を担当者に確認してください。'
            : '次の操作内容を確認してください。',
      );
    } catch {
      setMessage('状態を確認できませんでした。権限・停止状態・準備設定を確認してください。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (lock.current) return;
    const command = pending.current ?? internalCommand(snapshot, evidence, confirmed, cap);
    if (!command) return;
    pending.current = command;
    lock.current = true;
    setBusy(true);
    setRetry(false);
    const result = await submitInternal(serviceSlug, command);
    lock.current = false;
    setBusy(false);
    if (result === 'RETRY') {
      setRetry(true);
      setMessage(
        '結果が不明です。同じ操作だけを再送して確認してください。新しい操作は行いません。',
      );
      return;
    }
    pending.current = null;
    setSnapshot(null);
    setConfirmed(false);
    setCap('');
    setMessage(
      result === 'SAVED'
        ? '操作を確認しました。本人の準備状態を再確認してから次へ進んでください。'
        : '操作は受理されませんでした。状態を再確認し、変更内容を改めて確認してください。',
    );
  }
  const action =
    step === 'CONFIGURE'
      ? '内部人数を設定'
      : step === 'PREPARE_ENROLLMENT'
        ? '本人Enrollmentを準備'
        : '本人の内部参加権を付与';
  return (
    <section className="card stack">
      <h2>内部テスターとして本人を準備</h2>
      <p>
        マナベルスタイル by
        ワタシワークス。ログイン中のサービス所有者本人のみが対象です。管理者ロールは変更しません。
      </p>
      <p>
        停止中のWave 0で、内部人数設定 → 本人Enrollment →
        INTERNAL参加権の順に準備します。外部参加者は登録しません。
      </p>
      <p>
        Profileは本人が回答します。Definition承認・Pilot開始・通知・課金呼び出しはこの画面では行いません。
      </p>
      <p role="status">{message}</p>
      <button type="button" disabled={busy || retry} onClick={() => void refresh()}>
        本人の準備状態を確認
      </button>
      {snapshot && snapshot.policy && (
        <p>
          Wave {snapshot.policy.currentWave}：外部受付上限 {snapshot.policy.currentWaveCap}{' '}
          人、内部上限 {snapshot.policy.internalParticipantCap} 人
        </p>
      )}
      {snapshot && !['BLOCKED', 'DONE'].includes(step) && !retry && (
        <>
          <h3>{action}</h3>
          {step === 'CONFIGURE' && (
            <>
              <p>
                初回設定のみ。外部累計上限100人・Wave
                0の外部受付0人。内部人数は人間が選択します。既存設定は上書きしません。
              </p>
              <label>
                内部テスター人数上限
                <select
                  value={cap}
                  disabled={busy}
                  onChange={(e) => {
                    setCap(e.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">選択してください</option>
                  <option value="1">1人</option>
                  <option value="2">2人</option>
                </select>
              </label>
            </>
          )}
          {step === 'PREPARE_ENROLLMENT' && (
            <p>
              本人の期限なし・無料・招待制・学習支援のみのEnrollmentを準備します。まだ参加権は付与しません。
            </p>
          )}
          {step === 'ADMIT' && (
            <p>
              本人のINTERNAL参加権を付与します。外部100人枠は消費しません。取消後の枠は自動再利用できません。
            </p>
          )}
          <label>
            人間レビュー記録の識別子（本文・秘密情報は入力しない）
            <input
              value={evidence}
              maxLength={100}
              disabled={busy}
              onChange={(e) => {
                setEvidence(e.target.value);
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
            対象が本人であることと、今回の操作内容を確認しました
          </label>
          <button
            type="button"
            disabled={
              busy ||
              !confirmed ||
              !/^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence) ||
              (step === 'CONFIGURE' && !['1', '2'].includes(cap))
            }
            onClick={() => void submit()}
          >
            {action}
          </button>
        </>
      )}
      {retry && (
        <>
          <button type="button" disabled={busy} onClick={() => void submit()}>
            同じ操作を再送して確認
          </button>
          <p>
            ページを離れると再送情報は失われます。再読込後は状態確認のみを行い、不明なまま操作を繰り返さないでください。
          </p>
        </>
      )}
      {step === 'DONE' && snapshot?.programEnrollmentId && (
        <a href={`/s/${serviceSlug}/programs/${snapshot.programEnrollmentId}`}>
          本人の学習準備画面へ
        </a>
      )}
    </section>
  );
}
