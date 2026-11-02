import { ApplicationError } from '@bunshin/shared';
import type { ExternalReadGrant } from './external-connection-read';
import type { MemberUsageScope } from './member-usage';

export const EXTERNAL_READ_FEATURE_KEY = 'EXTERNAL.READ';
export const EXTERNAL_READ_CONSENT_VERSION = 'external-read-consent-v1';
export interface ExternalGrantOwner {
  actorUserId: string;
  scope: MemberUsageScope;
}
export interface ExternalGrantIssue {
  commandId: string;
  clientId: string;
  operation: 'member-usage:read';
  expiresInMinutes: number;
  consentVersion: typeof EXTERNAL_READ_CONSENT_VERSION;
}
export interface ExternalGrantRevoke {
  connectionId: string;
  expectedRevision: number;
}
export interface ExternalGrantManagementRepository {
  issue(owner: ExternalGrantOwner, command: ExternalGrantIssue): Promise<ExternalReadGrant>;
  revoke(owner: ExternalGrantOwner, command: ExternalGrantRevoke): Promise<ExternalReadGrant>;
  list(owner: ExternalGrantOwner): Promise<ExternalReadGrant[]>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid external read grant command');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).sort().join(',') !== expected.sort().join(',')) invalid();
}
export function normalizeExternalGrantOwner(value: ExternalGrantOwner): ExternalGrantOwner {
  const owner = record(value);
  keys(owner, ['actorUserId', 'scope']);
  const scope = record(owner['scope']);
  keys(scope, ['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId']);
  if (
    Object.values(scope).some((id) => typeof id !== 'string' || !uuid.test(id)) ||
    owner['actorUserId'] !== scope['userId']
  )
    invalid();
  return { actorUserId: value.actorUserId, scope: { ...value.scope } };
}
export function normalizeExternalGrantIssue(value: unknown): ExternalGrantIssue {
  const command = record(value);
  keys(command, ['commandId', 'clientId', 'operation', 'expiresInMinutes', 'consentVersion']);
  if (
    typeof command['commandId'] !== 'string' ||
    !uuid.test(command['commandId']) ||
    typeof command['clientId'] !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(command['clientId']) ||
    command['operation'] !== 'member-usage:read' ||
    command['consentVersion'] !== EXTERNAL_READ_CONSENT_VERSION ||
    typeof command['expiresInMinutes'] !== 'number' ||
    !Number.isInteger(command['expiresInMinutes']) ||
    command['expiresInMinutes'] < 5 ||
    command['expiresInMinutes'] > 1440
  )
    invalid();
  return {
    commandId: command['commandId'],
    clientId: command['clientId'],
    operation: command['operation'],
    expiresInMinutes: command['expiresInMinutes'],
    consentVersion: command['consentVersion'],
  };
}
export function normalizeExternalGrantRevoke(value: unknown): ExternalGrantRevoke {
  const command = record(value);
  keys(command, ['connectionId', 'expectedRevision']);
  if (
    typeof command['connectionId'] !== 'string' ||
    !uuid.test(command['connectionId']) ||
    typeof command['expectedRevision'] !== 'number' ||
    !Number.isSafeInteger(command['expectedRevision']) ||
    command['expectedRevision'] < 1
  )
    invalid();
  return { connectionId: command['connectionId'], expectedRevision: command['expectedRevision'] };
}
/** Owner context comes from the authenticated server, never an external agent's claimed user ID. */
export class ManageExternalReadGrants {
  constructor(private readonly repository: ExternalGrantManagementRepository) {}
  issue(owner: ExternalGrantOwner, command: unknown) {
    return this.repository.issue(
      normalizeExternalGrantOwner(owner),
      normalizeExternalGrantIssue(command),
    );
  }
  revoke(owner: ExternalGrantOwner, command: unknown) {
    return this.repository.revoke(
      normalizeExternalGrantOwner(owner),
      normalizeExternalGrantRevoke(command),
    );
  }
  list(owner: ExternalGrantOwner) {
    return this.repository.list(normalizeExternalGrantOwner(owner));
  }
}
