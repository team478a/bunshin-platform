'use client';

import { useRef, useState } from 'react';

type ParticipantSnapshot = {
  policy: {
    revision: number;
    internalParticipantCap: number;
    currentWave: number;
  } | null;
  seats: {
    programEnrollmentId: string;
    kind: 'INTERNAL' | 'EXTERNAL';
    revokedAt: string | null;
  }[];
  enrollments: {
    id: string;
    name: string;
    personaOptedIn: boolean;
    inferredPersonaCount: number;
    learnerEnteredPersonaCount: number;
  }[];
};
type AdmitCommand = {
  operationId: string;
  expectedRevision: number;
  confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION';
  reviewEvidenceKey: string;
  action: 'ADMIT';
  programEnrollmentId: string;
  kind: 'INTERNAL';
};

export function participantSnapshot(value: unknown): ParticipantSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const policy = v.policy;
  if (
    policy !== null &&
    (!policy ||
      typeof policy !== 'object' ||
      !Number.isSafeInteger((policy as Record<string, unknown>).revision) ||
      !Number.isSafeInteger((policy as Record<string, unknown>).internalParticipantCap) ||
      !Number.isSafeInteger((policy as Record<string, unknown>).currentWave))
  )
    return null;
  if (!Array.isArray(v.seats) || !Array.isArray(v.enrollments)) return null;
  const seats = v.seats.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return typeof row.programEnrollmentId === 'string' &&
      ['INTERNAL', 'EXTERNAL'].includes(String(row.kind)) &&
      (row.revokedAt === null || typeof row.revokedAt === 'string')
      ? [
          {
            programEnrollmentId: row.programEnrollmentId,
            kind: row.kind as 'INTERNAL' | 'EXTERNAL',
            revokedAt: row.revokedAt,
          },
        ]
      : [];
  });
  const enrollments = v.enrollments.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return typeof row.id === 'string' &&
      typeof row.name === 'string' &&
      typeof row.personaOptedIn === 'boolean' &&
      Number.isSafeInteger(row.inferredPersonaCount) &&
      Number(row.inferredPersonaCount) >= 0 &&
      Number.isSafeInteger(row.learnerEnteredPersonaCount) &&
      Number(row.learnerEnteredPersonaCount) >= 0
      ? [
          {
            id: row.id,
            name: row.name,
            personaOptedIn: row.personaOptedIn,
            inferredPersonaCount: Number(row.inferredPersonaCount),
            learnerEnteredPersonaCount: Number(row.learnerEnteredPersonaCount),
          },
        ]
      : [];
  });
  if (seats.length !== v.seats.length || enrollments.length !== v.enrollments.length) return null;
  return {
    policy: policy as ParticipantSnapshot['policy'],
    seats,
    enrollments,
  };
}

export function InternalParticipantsCard({ serviceSlug }: { serviceSlug: string }) {
  const [snapshot, setSnapshot] = useState<ParticipantSnapshot | null>(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState('');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState('参加者の状態を確認してください。');
  const pending = useRef<AdmitCommand | null>(null);
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/pilot-participants`;
  const activeInternal =
    snapshot?.seats.filter((seat) => seat.kind === 'INTERNAL' && !seat.revokedAt).length ?? 0;
  const eligible = snapshot?.enrollments.filter(
    (enrollment) => !snapshot.seats.some((seat) => seat.programEnrollmentId === enrollment.id),
  );

  async function read(): Promise<ParticipantSnapshot | null> {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: unknown };
    return participantSnapshot(body.data);
  }

  async function refresh() {
    if (busy || pending.current) return;
    setBusy(true);
    setSnapshot(null);
    setConfirmed(false);
    try {
      const current = await read();
      if (!current) throw new Error('unavailable');
      setSnapshot(current);
      setMessage('対象Enrollmentと現在の枠を確認しました。付与対象を選んでください。');
    } catch {
      setMessage('状態を確認できません。運用flag・停止状態・対象Programを確認してください。');
    } finally {
      setBusy(false);
    }
  }

  async function admit() {
    if (
      busy ||
      !snapshot?.policy ||
      !confirmed ||
      !eligible?.some((item) => item.id === selectedEnrollment)
    )
      return;
    const command = pending.current ?? {
      operationId: crypto.randomUUID(),
      expectedRevision: snapshot.policy.revision,
      confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION' as const,
      reviewEvidenceKey: evidence,
      action: 'ADMIT' as const,
      programEnrollmentId: selectedEnrollment,
      kind: 'INTERNAL' as const,
    };
    if (!/^[a-zA-Z0-9_.:-]{1,100}$/.test(command.reviewEvidenceKey)) return;
    pending.current = command;
    setBusy(true);
    setRetry(false);
    setMessage('内部参加枠を付与しています…');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
      });
      if (!response.ok && response.status < 500) {
        pending.current = null;
        setSnapshot(null);
        setRetry(false);
        setMessage('操作は受理されませんでした。状態を再取得してから内容を確認してください。');
        return;
      }
      if (!response.ok) throw new Error('unknown');
      const current = await read();
      const seat = current?.seats.find(
        (item) => item.programEnrollmentId === command.programEnrollmentId,
      );
      if (!current || seat?.kind !== 'INTERNAL' || seat.revokedAt) throw new Error('unknown');
      pending.current = null;
      setSnapshot(current);
      setConfirmed(false);
      setEvidence('');
      setMessage('内部参加枠を確認しました。受講者はLINEのホームから学習プログラムを開けます。');
    } catch {
      setRetry(true);
      setMessage('付与結果を確認できません。同じ操作を再送する前に状態を確認してください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>招待参加者へ内部研修枠を付与</h2>
      <p>
        LINEの招待URLでサービス参加した人を、通常のプログラム管理画面でAI研修へ登録した後に行います。
        サービス参加だけでは研修枠は付きません。ここで付与するのは停止中Wave 0のINTERNAL枠です。
      </p>
      <p>枠付与は明示操作です。LINEログイン、参加同意、Profile回答、研修開始を代行しません。</p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <button type="button" disabled={busy || retry} onClick={() => void refresh()}>
        参加者と枠の状態を確認
      </button>
      {snapshot && !snapshot.policy ? (
        <p>
          内部枠数が未設定です。先に上の「内部テスターとして本人を準備」から上限を設定してください。
        </p>
      ) : null}
      {snapshot?.policy ? (
        <>
          <p>
            内部枠：{activeInternal}/{snapshot.policy.internalParticipantCap}人（Wave{' '}
            {snapshot.policy.currentWave}）
          </p>
          <section aria-label="本人像の利用状態（本文は表示しません）">
            <h3>本人像の状態（件数のみ）</h3>
            <ul>
              {snapshot.enrollments.map((enrollment) => (
                <li key={enrollment.id}>
                  {enrollment.name}：{enrollment.personaOptedIn ? '本人像を利用中' : '未同意'}、
                  AI推測 {enrollment.inferredPersonaCount}件、本人入力{' '}
                  {enrollment.learnerEnteredPersonaCount}件
                </li>
              ))}
            </ul>
          </section>
          {!eligible?.length ? (
            <p>
              枠を付与できる有効な研修Enrollmentがありません。先に通常のプログラム管理画面で参加登録してください。
            </p>
          ) : (
            <>
              <label>
                <span>内部枠を付与する受講者</span>
                <select
                  value={selectedEnrollment}
                  disabled={busy || retry}
                  onChange={(event) => {
                    setSelectedEnrollment(event.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">選択してください</option>
                  {eligible.map((enrollment) => (
                    <option key={enrollment.id} value={enrollment.id}>
                      {enrollment.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>人間レビュー記録の識別子（本文・秘密情報は入力しない）</span>
                <input
                  value={evidence}
                  maxLength={100}
                  disabled={busy || retry}
                  onChange={(event) => {
                    setEvidence(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || retry}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                この人が社内テスターであり、内部枠を付与することを確認しました
              </label>
              <button
                type="button"
                disabled={
                  busy ||
                  retry ||
                  !snapshot.policy ||
                  activeInternal >= snapshot.policy.internalParticipantCap ||
                  !selectedEnrollment ||
                  !/^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence) ||
                  !confirmed
                }
                onClick={() => void admit()}
              >
                INTERNAL参加枠を付与
              </button>
            </>
          )}
        </>
      ) : null}
      {retry ? (
        <>
          <button type="button" disabled={busy} onClick={() => void admit()}>
            同じ操作の結果を再確認
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              pending.current = null;
              setRetry(false);
              void refresh();
            }}
          >
            変更を行わず状態を再取得
          </button>
        </>
      ) : null}
    </section>
  );
}
