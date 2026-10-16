import { parsePilotOperation, type PilotOperation } from '@bunshin/application';

export type PilotOperationsSnapshot = {
  exists: boolean;
  status: string;
  initialized: boolean;
  enabled: boolean;
  started: boolean;
  stateToken: string;
};

export function pilotOperationsSnapshot(value: unknown): PilotOperationsSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.exists !== 'boolean' ||
    typeof v.status !== 'string' ||
    typeof v.initialized !== 'boolean' ||
    typeof v.enabled !== 'boolean' ||
    typeof v.started !== 'boolean' ||
    typeof v.stateToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.stateToken)
  )
    return null;
  return {
    exists: v.exists,
    status: v.status,
    initialized: v.initialized,
    enabled: v.enabled,
    started: v.started,
    stateToken: v.stateToken,
  };
}

export function availablePilotOperation(snapshot: PilotOperationsSnapshot | null) {
  if (!snapshot?.exists) return null;
  if (!snapshot.initialized) return 'INITIALIZE' as const;
  if (snapshot.started) return 'STOP' as const;
  if (snapshot.status === 'SUSPENDED' && !snapshot.enabled) return 'START' as const;
  return null;
}

export function createPilotOperationCommand(
  snapshot: PilotOperationsSnapshot | null,
  action: 'INITIALIZE' | 'START' | 'STOP',
  evidence: string,
  confirmed: boolean,
) {
  if (
    !confirmed ||
    !snapshot ||
    availablePilotOperation(snapshot) !== action ||
    !/^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence)
  )
    return null;
  return parsePilotOperation({
    action,
    operationId: crypto.randomUUID(),
    expectedStateToken: snapshot.stateToken,
    confirmation: 'CONFIRM_PILOT_OPERATION',
    reviewEvidenceKey: evidence,
  });
}

export function pilotOperationErrorMessage(reason: unknown, status?: number) {
  if (reason === 'PILOT_WAVE0_CONFIGURATION_REQUIRED')
    return 'Wave 0の上限・Call Admission設定が対象Programと一致していません。設定を確認してください。';
  if (reason === 'PILOT_DEFINITION_APPROVAL_REQUIRED')
    return '開始に必要な学習Definitionの承認が完了していません。3件すべての承認状況を確認してください。';
  if (reason === 'PILOT_PROFILE_REQUIRED')
    return '内部参加者のEnrollmentまたは本人Profileが未完了です。対象者の準備状態を確認してください。';
  if (reason === 'PILOT_START_NOT_READY')
    return '開始条件を満たしていません。内部Seat、参加者、未精算Callがないことを確認してください。';
  if (reason === 'PILOT_STATE_CHANGED')
    return '状態が更新されています。現在の状態を再取得し、最新内容を確認してください。';
  if (reason === 'PILOT_CONCURRENT_OPERATION')
    return '別の運用操作と競合しました。状態を再取得してください。';
  if (reason === 'PILOT_EMPTY_DEDICATED_PROGRAM_REQUIRED')
    return '専用の空Programではないため操作できません。対象Programを確認してください。';
  if (reason === 'PILOT_OPERATION_SUPERSEDED')
    return 'この操作はすでに後続状態へ進んでいます。最新状態を確認してください。';
  if (status === 404 || status === 403)
    return '操作権限または運用設定を確認できません。環境担当者に確認してください。';
  if (status === 409) return '状態が競合しました。再取得してから操作してください。';
  return '操作を確認できませんでした。状態を再取得してください。';
}

export async function submitPilotOperation(
  endpoint: string,
  command: PilotOperation,
): Promise<{ result: 'SAVED' | 'RETRY' | 'REJECTED'; message?: string }> {
  if (!parsePilotOperation(command) || command.action === 'CREATE_PROGRAM')
    return { result: 'REJECTED', message: '操作内容を確認してください。' };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { reason?: unknown };
      } | null;
      const reason = body?.error?.reason;
      return {
        result: response.status >= 500 ? 'RETRY' : 'REJECTED',
        message: pilotOperationErrorMessage(reason, response.status),
      };
    }
    const verified = await fetch(endpoint, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!verified.ok) return { result: 'RETRY' };
    const body = (await verified.json()) as { data?: unknown };
    const after = pilotOperationsSnapshot(body.data);
    if (!after) return { result: 'RETRY' };
    const saved =
      (command.action === 'INITIALIZE' && after.initialized && !after.enabled) ||
      (command.action === 'START' && after.status === 'ACTIVE' && after.enabled && after.started) ||
      (command.action === 'STOP' &&
        after.status === 'SUSPENDED' &&
        !after.enabled &&
        after.started);
    return saved ? { result: 'SAVED' } : { result: 'REJECTED' };
  } catch {
    return { result: 'RETRY' };
  }
}
