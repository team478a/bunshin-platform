'use client';
import { useRef, useState } from 'react';
import {
  readParticipantConfiguration,
  submitWave0Configuration,
  wave0Command,
  type ParticipantSnapshot,
  type Wave0Command,
} from './participant-client';

export function ParticipantConfigurationCard({
  serviceSlug,
  programId,
}: {
  serviceSlug: string;
  programId: string;
}) {
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/pilot-participants`;
  const [snapshot, setSnapshot] = useState<ParticipantSnapshot | null>(null);
  const [internalCap, setInternalCap] = useState(2);
  const [externalCap, setExternalCap] = useState('100');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState(
    'まず現在の人数設定を確認してください。初期候補は未保存です。',
  );
  const lock = useRef(false);
  const pending = useRef<Wave0Command | null>(null);
  async function refresh() {
    if (lock.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    setSnapshot(null);
    setConfirmed(false);
    try {
      const current = await readParticipantConfiguration(endpoint);
      setSnapshot(current);
      setInternalCap(current.policy?.internalParticipantCap ?? 2);
      setExternalCap(String(current.policy?.externalParticipantCap ?? 100));
      setMessage(
        current.policy
          ? '保存済み設定を読み込みました。変更には再確認が必要です。'
          : '人数設定は未保存です。内部2人・外部100人は初期候補です。',
      );
    } catch {
      setMessage('人数設定を確認できませんでした。権限・停止状態・準備設定を確認してください。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const allowed =
    snapshot &&
    snapshot.externalCount === 0 &&
    (!snapshot.policy || snapshot.policy.currentWave === 0);
  const valid =
    confirmed &&
    /^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence) &&
    /^(0|[1-9][0-9]?|100)$/.test(externalCap) &&
    [1, 2].includes(internalCap) &&
    snapshot &&
    snapshot.internalCount <= internalCap;
  async function submit() {
    if (lock.current) return;
    const command =
      pending.current ??
      (valid
        ? wave0Command(snapshot, internalCap, Number(externalCap), evidence, confirmed)
        : null);
    if (!command) return;
    pending.current = command;
    lock.current = true;
    setBusy(true);
    setRetry(false);
    const result = await submitWave0Configuration(endpoint, command);
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
        ? 'Wave 0の人数設定を保存・再読取しました。外部受付は0人です。参加者登録・Pilot開始・通知は行っていません。'
        : '設定の保存・現在値の一致を確認できませんでした。状態を再確認し、人間レビュー後に操作してください。',
    );
  }
  return (
    <section className="card stack">
      <h2>Wave 0の人数設定</h2>
      <p>
        対象Program ID: <span style={{ overflowWrap: 'anywhere' }}>{programId}</span>
      </p>
      <p>
        停止中のみ設定できます。内部枠は外部100人枠と別集計です。Wave 0の外部受付は0人で固定です。
      </p>
      <p>
        参加者登録・取消・Wave昇格・Definition承認・Pilot開始・費用設定はこの画面では行いません。
      </p>
      <p role="status">{message}</p>
      <button type="button" disabled={busy || retry} onClick={() => void refresh()}>
        現在の人数設定を確認
      </button>
      {snapshot && (
        <>
          <p>
            {snapshot.policy
              ? `保存済み: 内部上限${snapshot.policy.internalParticipantCap}人、外部累計上限${snapshot.policy.externalParticipantCap}人、Wave ${snapshot.policy.currentWave}（外部受付上限${snapshot.policy.currentWaveCap}人）`
              : '保存済み設定: なし'}
          </p>
          <p>
            消費済み枠（取消済みを含む）: 内部{snapshot.internalCount}人・外部
            {snapshot.externalCount}人
          </p>
        </>
      )}
      {snapshot && !allowed && (
        <p>Wave 0の初期準備対象ではありません。この画面では変更しません。</p>
      )}
      {allowed && (
        <>
          <label>
            内部参加者上限
            <select
              value={internalCap}
              disabled={busy || retry}
              onChange={(e) => {
                setInternalCap(Number(e.target.value));
                setConfirmed(false);
              }}
            >
              <option value={1}>1人</option>
              <option value={2}>2人</option>
            </select>
          </label>
          <label>
            外部モニター累計上限（0〜100人。Wave 0の受付は0人）
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={externalCap}
              disabled={busy || retry}
              onChange={(e) => {
                setExternalCap(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label>
            人間レビュー記録の識別子（本文・秘密情報は入力しない）
            <input
              value={evidence}
              maxLength={100}
              disabled={busy || retry}
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
              disabled={busy || retry}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            対象と人数上限を確認しました。Wave 0・外部受付0人のまま保存します
          </label>
          <button type="button" disabled={busy || retry || !valid} onClick={() => void submit()}>
            停止状態で人数設定を保存
          </button>
        </>
      )}
      {retry && (
        <>
          <button type="button" disabled={busy} onClick={() => void submit()}>
            同じ人数設定操作を再送して確認
          </button>
          <p>
            ページを離れると再送情報は失われます。再読み込み後は状態確認のみを行い、不明なまま新規操作を繰り返さないでください。
          </p>
        </>
      )}
    </section>
  );
}
