import { parsePilotOperation, type PilotOperation } from '@bunshin/application';

export type PreparationSnapshot = {
  exists: boolean;
  status: string;
  enabled: boolean;
  stateToken: string;
};
export function preparationSnapshot(value: unknown): PreparationSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.exists !== 'boolean' ||
    typeof v.status !== 'string' ||
    typeof v.enabled !== 'boolean' ||
    typeof v.stateToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.stateToken)
  )
    return null;
  return { exists: v.exists, status: v.status, enabled: v.enabled, stateToken: v.stateToken };
}
export function createPreparationCommand(
  snapshot: PreparationSnapshot | null,
  evidence: string,
  confirmed: boolean,
): PilotOperation | null {
  if (
    !confirmed ||
    !snapshot ||
    snapshot.exists ||
    snapshot.status !== 'ABSENT' ||
    snapshot.enabled
  )
    return null;
  return parsePilotOperation({
    action: 'CREATE_PROGRAM',
    operationId: crypto.randomUUID(),
    expectedStateToken: snapshot.stateToken,
    confirmation: 'CONFIRM_PILOT_OPERATION',
    reviewEvidenceKey: evidence,
  });
}
export async function submitPreparation(
  endpoint: string,
  command: PilotOperation,
): Promise<'SAVED' | 'RETRY' | 'REJECTED'> {
  if (command.action !== 'CREATE_PROGRAM' || !parsePilotOperation(command)) return 'REJECTED';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) return response.status >= 500 ? 'RETRY' : 'REJECTED';
    const body = (await response.json()) as { data?: unknown };
    const snapshot = preparationSnapshot(body.data);
    const receipt = body.data as Record<string, unknown> | undefined;
    return snapshot?.exists &&
      snapshot.status === 'SUSPENDED' &&
      !snapshot.enabled &&
      typeof receipt?.programOfferingId === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        receipt.programOfferingId,
      )
      ? 'SAVED'
      : 'RETRY';
  } catch {
    return 'RETRY';
  }
}
