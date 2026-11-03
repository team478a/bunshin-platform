import { ApplicationError } from '@bunshin/shared';

export interface ServiceReferralRegistrationAudit {
  workspaceId: string;
  groupId: string;
  groupMembershipId: string | null;
  performedByUserId: string;
  occurredAt: Date;
  action: string;
  reason: string | null;
  beforeData: unknown;
  afterData: unknown;
}

/** Existing public-registration writer contract only; never infer origin from timestamps alone. */
export function projectServiceReferralRegistrationOrigin(
  member: { workspaceId: string; serviceId: string; groupMembershipId: string; userId: string },
  registeredAt: Date | null,
  audits: readonly ServiceReferralRegistrationAudit[],
  complete: boolean,
): boolean | null {
  if (!complete || !registeredAt) return null;
  const matches = audits.filter((row) => {
    if (
      row.workspaceId !== member.workspaceId ||
      row.groupId !== member.serviceId ||
      row.groupMembershipId !== member.groupMembershipId
    )
      throw new ApplicationError('VALIDATION_ERROR', 'foreign registration audit');
    return (
      row.performedByUserId === member.userId && row.occurredAt.getTime() === registeredAt.getTime()
    );
  });
  if (matches.length !== 1) return null;
  const row = matches[0]!;
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(row.beforeData) || !object(row.afterData)) return null;
  const active =
    row.action === 'APPROVED' &&
    row.reason === 'public service registration' &&
    row.afterData.status === 'ACTIVE';
  const pending =
    row.action === 'REQUESTED' &&
    row.reason === 'service participation requested' &&
    row.afterData.status === 'PENDING_APPROVAL';
  if (
    (!active && !pending) ||
    row.afterData.role !== 'PARTICIPANT' ||
    Object.keys(row.afterData).sort().join(',') !== 'role,status'
  )
    return null;
  const before = Object.keys(row.beforeData);
  if (!before.length) return true;
  if (
    before.length === 1 &&
    before[0] === 'status' &&
    ['ACTIVE', 'PENDING_APPROVAL', 'DECLINED', 'REVOKED'].includes(String(row.beforeData.status))
  )
    return false;
  return null;
}
