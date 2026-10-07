export type PilotOperation = Readonly<{
  operationId: string;
  expectedStateToken: string;
  confirmation: 'CONFIRM_PILOT_OPERATION';
  reviewEvidenceKey: string;
}> &
  (
    | { action: 'CREATE_PROGRAM' | 'INITIALIZE' | 'START' | 'STOP' }
    | { action: 'PREPARE_ENROLLMENT'; groupMembershipId: string; programOfferingId: string }
  );

export function parsePilotOperation(value: unknown): PilotOperation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ['action', 'operationId', 'expectedStateToken', 'confirmation', 'reviewEvidenceKey'];
  if (v.action === 'PREPARE_ENROLLMENT') keys.push('groupMembershipId', 'programOfferingId');
  const uuid = (s: unknown) =>
    typeof s === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s);
  if (
    typeof v.action !== 'string' ||
    !['CREATE_PROGRAM', 'INITIALIZE', 'PREPARE_ENROLLMENT', 'START', 'STOP'].includes(v.action) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k)) ||
    !uuid(v.operationId) ||
    v.confirmation !== 'CONFIRM_PILOT_OPERATION' ||
    typeof v.expectedStateToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.expectedStateToken) ||
    typeof v.reviewEvidenceKey !== 'string' ||
    !/^[a-zA-Z0-9_.:-]{1,100}$/.test(v.reviewEvidenceKey) ||
    (v.action === 'PREPARE_ENROLLMENT' &&
      (!uuid(v.groupMembershipId) || !uuid(v.programOfferingId)))
  )
    return null;
  return Object.freeze({ ...v }) as PilotOperation;
}
