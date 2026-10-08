import { parsePilotOperation, type PilotOperation } from '@bunshin/application';
import {
  parsePilotParticipantPolicy,
  type PilotParticipantPolicy,
} from '@bunshin/capability-training';
import { preparationSnapshot, type PreparationSnapshot } from './client';

const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export type InternalSnapshot = {
  operation: PreparationSnapshot;
  policy: PilotParticipantPolicy | null;
  groupMembershipId: string;
  programOfferingId: string | null;
  programEnrollmentId: string | null;
  enrollmentReady: boolean;
  seatStatus: 'ABSENT' | 'INTERNAL' | 'REVOKED' | 'OTHER';
};
export function internalSnapshot(value: unknown): InternalSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const operation = preparationSnapshot(v.operation);
  const policy = v.policy === null ? null : parsePilotParticipantPolicy(v.policy);
  if (
    !operation ||
    (v.policy !== null && !policy) ||
    !uuid(v.groupMembershipId) ||
    (v.programOfferingId !== null && !uuid(v.programOfferingId)) ||
    (v.programEnrollmentId !== null && !uuid(v.programEnrollmentId)) ||
    typeof v.enrollmentReady !== 'boolean' ||
    !['ABSENT', 'INTERNAL', 'REVOKED', 'OTHER'].includes(String(v.seatStatus))
  )
    return null;
  return {
    operation,
    policy,
    groupMembershipId: v.groupMembershipId,
    programOfferingId: v.programOfferingId,
    programEnrollmentId: v.programEnrollmentId,
    enrollmentReady: v.enrollmentReady,
    seatStatus: v.seatStatus as InternalSnapshot['seatStatus'],
  };
}
export function internalStep(s: InternalSnapshot | null) {
  if (
    !s ||
    !s.operation.exists ||
    s.operation.status !== 'SUSPENDED' ||
    s.operation.enabled ||
    ['REVOKED', 'OTHER'].includes(s.seatStatus)
  )
    return 'BLOCKED';
  if (!s.policy) return !s.programEnrollmentId ? 'CONFIGURE' : 'BLOCKED';
  if (
    s.policy.currentWave !== 0 ||
    s.policy.currentWaveCap !== 0 ||
    ![1, 2].includes(s.policy.internalParticipantCap)
  )
    return 'BLOCKED';
  if (!s.programEnrollmentId) return s.programOfferingId ? 'PREPARE_ENROLLMENT' : 'BLOCKED';
  if (!s.enrollmentReady) return 'BLOCKED';
  return s.seatStatus === 'INTERNAL' ? 'DONE' : 'ADMIT';
}
type ParticipantCommand =
  | {
      action: 'CONFIGURE';
      externalParticipantCap: 100;
      internalParticipantCap: 1 | 2;
      currentWave: 0;
    }
  | { action: 'ADMIT'; programEnrollmentId: string; kind: 'INTERNAL' };
export type InternalCommand =
  | PilotOperation
  | (ParticipantCommand & {
      operationId: string;
      expectedRevision: number;
      confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION';
      reviewEvidenceKey: string;
    });
export function internalCommand(
  s: InternalSnapshot | null,
  evidence: string,
  confirmed: boolean,
  internalCap: string,
): InternalCommand | null {
  if (!s || !confirmed || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence)) return null;
  const step = internalStep(s);
  const common = { operationId: crypto.randomUUID(), reviewEvidenceKey: evidence };
  if (step === 'PREPARE_ENROLLMENT')
    return parsePilotOperation({
      ...common,
      action: step,
      expectedStateToken: s.operation.stateToken,
      confirmation: 'CONFIRM_PILOT_OPERATION',
      groupMembershipId: s.groupMembershipId,
      programOfferingId: s.programOfferingId,
    });
  const participant = {
    ...common,
    expectedRevision: s.policy?.revision ?? 0,
    confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION' as const,
  };
  if (step === 'CONFIGURE' && ['1', '2'].includes(internalCap))
    return {
      ...participant,
      action: step,
      externalParticipantCap: 100,
      internalParticipantCap: Number(internalCap) as 1 | 2,
      currentWave: 0,
    };
  if (step === 'ADMIT' && s.programEnrollmentId)
    return {
      ...participant,
      action: step,
      programEnrollmentId: s.programEnrollmentId,
      kind: 'INTERNAL',
    };
  return null;
}
export async function submitInternal(
  slug: string,
  command: InternalCommand,
): Promise<'SAVED' | 'RETRY' | 'REJECTED'> {
  // No START/STOP/INITIALIZE/APPROVE/EXTERNAL/REVOKE operation is exposed here.
  if (
    command.action !== 'CONFIGURE' &&
    command.action !== 'PREPARE_ENROLLMENT' &&
    command.action !== 'ADMIT'
  )
    return 'REJECTED';
  if (command.action === 'PREPARE_ENROLLMENT') {
    if (!parsePilotOperation(command)) return 'REJECTED';
  } else if (
    !uuid(command.operationId) ||
    !/^[a-zA-Z0-9_.:-]{1,100}$/.test(command.reviewEvidenceKey) ||
    command.confirmation !== 'CONFIRM_PILOT_PARTICIPANT_OPERATION' ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    (command.action === 'CONFIGURE' &&
      (command.expectedRevision !== 0 ||
        command.currentWave !== 0 ||
        command.externalParticipantCap !== 100 ||
        ![1, 2].includes(command.internalParticipantCap) ||
        Object.keys(command).length !== 8)) ||
    (command.action === 'ADMIT' &&
      (command.kind !== 'INTERNAL' ||
        !uuid(command.programEnrollmentId) ||
        Object.keys(command).length !== 7))
  )
    return 'REJECTED';
  const endpoint =
    command.action === 'PREPARE_ENROLLMENT' ? 'pilot-operations' : 'pilot-participants';
  try {
    const response = await fetch(
      `/api/services/${encodeURIComponent(slug)}/ai-training/${endpoint}`,
      {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(command),
      },
    );
    if (!response.ok) return response.status >= 500 ? 'RETRY' : 'REJECTED';
    const body = (await response.json()) as { data?: Record<string, unknown> };
    if (command.action === 'PREPARE_ENROLLMENT') {
      const s = preparationSnapshot(body.data);
      return s?.exists &&
        s.status === 'SUSPENDED' &&
        !s.enabled &&
        uuid(body.data?.programEnrollmentId)
        ? 'SAVED'
        : 'RETRY';
    }
    return Number.isSafeInteger(body.data?.revision) &&
      Number(body.data?.revision) === command.expectedRevision + 1 &&
      (command.action === 'CONFIGURE'
        ? body.data?.reason === 'PILOT_WAVE_CONFIGURED'
        : ['PARTICIPANT_ADMITTED', 'PARTICIPANT_ALREADY_ADMITTED'].includes(
            String(body.data?.reason),
          ))
      ? 'SAVED'
      : 'RETRY';
  } catch {
    return 'RETRY';
  }
}
