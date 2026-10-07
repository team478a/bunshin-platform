import {
  parsePilotParticipantPolicy,
  type PilotParticipantPolicy,
} from '@bunshin/capability-training';

export type ParticipantSnapshot = Readonly<{
  policy: PilotParticipantPolicy | null;
  internalCount: number;
  externalCount: number;
}>;
export type Wave0Command = Readonly<{
  action: 'CONFIGURE';
  operationId: string;
  expectedRevision: number;
  confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION';
  reviewEvidenceKey: string;
  externalParticipantCap: number;
  internalParticipantCap: number;
  currentWave: 0;
}>;
export function participantSnapshot(value: unknown): ParticipantSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const policy = v.policy === null ? null : parsePilotParticipantPolicy(v.policy);
  if ((v.policy !== null && !policy) || !Array.isArray(v.seats)) return null;
  let internalCount = 0;
  let externalCount = 0;
  for (const seat of v.seats) {
    if (!seat || typeof seat !== 'object') return null;
    if (seat.kind === 'INTERNAL') internalCount++;
    else if (seat.kind === 'EXTERNAL') externalCount++;
    else return null;
  }
  // Revoked seats still consume capacity. No participant identifiers enter UI state.
  if (!policy && v.seats.length > 0) return null;
  return { policy, internalCount, externalCount };
}
export function wave0Command(
  snapshot: ParticipantSnapshot | null,
  internalCap: number,
  externalCap: number,
  evidence: string,
  confirmed: boolean,
): Wave0Command | null {
  if (
    !snapshot ||
    !confirmed ||
    !/^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence) ||
    ![1, 2].includes(internalCap) ||
    !Number.isInteger(externalCap) ||
    externalCap < 0 ||
    externalCap > 100 ||
    snapshot.externalCount !== 0 ||
    snapshot.internalCount > internalCap ||
    (snapshot.policy && snapshot.policy.currentWave !== 0)
  )
    return null;
  return {
    action: 'CONFIGURE',
    operationId: crypto.randomUUID(),
    expectedRevision: snapshot.policy?.revision ?? 0,
    confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION',
    reviewEvidenceKey: evidence,
    externalParticipantCap: externalCap,
    internalParticipantCap: internalCap,
    currentWave: 0,
  };
}
export async function readParticipantConfiguration(endpoint: string) {
  const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('unavailable');
  const body = (await response.json()) as { data?: unknown };
  const snapshot = participantSnapshot(body.data);
  if (!snapshot) throw new Error('invalid snapshot');
  return snapshot;
}
export async function submitWave0Configuration(
  endpoint: string,
  command: Wave0Command,
): Promise<'SAVED' | 'RETRY' | 'REJECTED'> {
  // This client cannot send ADMIT, REVOKE or a later wave.
  if (
    command.action !== 'CONFIGURE' ||
    command.confirmation !== 'CONFIRM_PILOT_PARTICIPANT_OPERATION' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      command.operationId,
    ) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    !/^[a-zA-Z0-9_.:-]{1,100}$/.test(command.reviewEvidenceKey) ||
    Object.keys(command).length !== 8 ||
    command.currentWave !== 0 ||
    ![1, 2].includes(command.internalParticipantCap) ||
    !Number.isInteger(command.externalParticipantCap) ||
    command.externalParticipantCap < 0 ||
    command.externalParticipantCap > 100
  )
    return 'REJECTED';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) return response.status >= 500 ? 'RETRY' : 'REJECTED';
    const body = (await response.json()) as { data?: { revision?: unknown; reason?: unknown } };
    if (
      body.data?.revision !== command.expectedRevision + 1 ||
      body.data.reason !== 'PILOT_WAVE_CONFIGURED'
    )
      return 'RETRY';
    // A receipt alone is not proof that the current settings still match.
    const current = await readParticipantConfiguration(endpoint);
    return current.policy?.revision === command.expectedRevision + 1 &&
      current.policy.currentWave === 0 &&
      current.policy.currentWaveCap === 0 &&
      current.policy.internalParticipantCap === command.internalParticipantCap &&
      current.policy.externalParticipantCap === command.externalParticipantCap
      ? 'SAVED'
      : 'REJECTED';
  } catch {
    return 'RETRY';
  }
}
