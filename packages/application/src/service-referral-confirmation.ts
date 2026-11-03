import { ApplicationError } from '@bunshin/shared';

interface Scope {
  workspaceId: string;
  serviceId: string;
}
export type ServiceReferralReview = 'UNKNOWN' | 'REQUIRED' | 'CLEAR';
export interface ServiceReferralConfirmation {
  scope: Scope;
  referralId: string;
  revision: number;
  state: 'UNASSESSED' | 'CONFIRMED' | 'REVOKED';
  review: ServiceReferralReview;
  confirmedPolicyVersionId: string | null;
  confirmedAt: string | null;
  revokedAt: string | null;
}
export interface ServiceReferralConfirmationPolicy {
  scope: Scope;
  id: string;
  active: boolean;
}
/** Server-generated proof from the selected evaluator, never client-supplied qualification. */
export interface ServiceReferralConfirmationProof {
  scope: Scope;
  referralId: string;
  policyVersionId: string;
  observedRevision: number;
  asOf: string;
  decision: 'QUALIFIED' | 'PENDING' | 'UNKNOWN' | 'REJECTED' | 'REVIEW_REQUIRED' | 'SUSPENDED';
}
interface Command {
  scope: Scope;
  referralId: string;
  actorUserId: string;
  reason: string;
  expectedRevision: number;
}
export type ServiceReferralConfirmationCommand = Command &
  (
    | { kind: 'REVIEW'; review: ServiceReferralReview }
    | {
        kind: 'CONFIRM';
        policy: ServiceReferralConfirmationPolicy;
        proof: ServiceReferralConfirmationProof;
      }
    | { kind: 'REVOKE' }
  );
const invalid = () => new ApplicationError('VALIDATION_ERROR', 'invalid referral confirmation');
const conflict = () => new ApplicationError('CONFLICT', 'referral confirmation conflict');
const text = (value: unknown, max = 120): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value === value.trim() &&
  value.length <= max;
const scope = (value: Scope) => value && text(value.workspaceId) && text(value.serviceId);
const sameScope = (a: Scope, b: Scope) =>
  a.workspaceId === b.workspaceId && a.serviceId === b.serviceId;
const revision = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
const timestamp = (value: string | null) =>
  value === null ||
  (text(value, 40) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value);
const reviews: readonly string[] = ['UNKNOWN', 'REQUIRED', 'CLEAR'];

/**
 * Pure transition only: does not authorize the actor, read evidence, persist or grant.
 * DB execution must verify manager permissions, latest policy, exact command replay,
 * and perform revision CAS + audit atomically before treating this as confirmed.
 */
export function transitionServiceReferralConfirmation(
  current: ServiceReferralConfirmation,
  command: ServiceReferralConfirmationCommand,
  at: Date,
): { changed: boolean; value: ServiceReferralConfirmation } {
  if (
    !current ||
    !scope(current.scope) ||
    !text(current.referralId) ||
    !revision(current.revision) ||
    !['UNASSESSED', 'CONFIRMED', 'REVOKED'].includes(current.state) ||
    !reviews.includes(current.review) ||
    !timestamp(current.confirmedAt) ||
    !timestamp(current.revokedAt) ||
    !command ||
    !scope(command.scope) ||
    !text(command.referralId) ||
    !text(command.actorUserId) ||
    !text(command.reason, 1000) ||
    !revision(command.expectedRevision) ||
    !['REVIEW', 'CONFIRM', 'REVOKE'].includes(command.kind) ||
    !(at instanceof Date) ||
    !Number.isFinite(at.getTime())
  )
    throw invalid();
  if (current.state === 'UNASSESSED') {
    if (
      current.confirmedAt !== null ||
      current.revokedAt !== null ||
      current.confirmedPolicyVersionId !== null
    )
      throw invalid();
  } else if (
    !text(current.confirmedPolicyVersionId) ||
    current.confirmedAt === null ||
    current.review !== 'CLEAR' ||
    (current.state === 'CONFIRMED' && current.revokedAt !== null) ||
    (current.state === 'REVOKED' &&
      (current.revokedAt === null ||
        Date.parse(current.revokedAt) < Date.parse(current.confirmedAt)))
  )
    throw invalid();
  if (
    !sameScope(current.scope, command.scope) ||
    current.referralId !== command.referralId ||
    current.revision !== command.expectedRevision
  )
    throw conflict();
  if (current.confirmedAt !== null && Date.parse(current.confirmedAt) > at.getTime())
    throw conflict();
  if (current.revokedAt !== null && Date.parse(current.revokedAt) > at.getTime()) throw conflict();
  const value: ServiceReferralConfirmation = {
    scope: { workspaceId: current.scope.workspaceId, serviceId: current.scope.serviceId },
    referralId: current.referralId,
    revision: current.revision,
    state: current.state,
    review: current.review,
    confirmedPolicyVersionId: current.confirmedPolicyVersionId,
    confirmedAt: current.confirmedAt,
    revokedAt: current.revokedAt,
  };
  const result = (changed: boolean) => {
    if (changed) {
      if (current.revision >= Number.MAX_SAFE_INTEGER - 1) throw conflict();
      value.revision += 1;
    }
    return { changed, value };
  };
  if (command.kind === 'REVIEW') {
    if (!reviews.includes(command.review)) throw invalid();
    if (current.state !== 'UNASSESSED') throw conflict();
    value.review = command.review;
    return result(current.review !== command.review);
  }
  if (command.kind === 'REVOKE') {
    if (current.state === 'REVOKED') return result(false);
    if (current.state !== 'CONFIRMED') throw conflict();
    value.state = 'REVOKED';
    value.revokedAt = at.toISOString();
    return result(true);
  }
  const { policy, proof } = command;
  if (
    !policy ||
    !scope(policy.scope) ||
    !text(policy.id) ||
    typeof policy.active !== 'boolean' ||
    !proof ||
    !scope(proof.scope) ||
    !text(proof.referralId) ||
    !text(proof.policyVersionId) ||
    !revision(proof.observedRevision) ||
    !text(proof.asOf, 40) ||
    !['QUALIFIED', 'PENDING', 'UNKNOWN', 'REJECTED', 'REVIEW_REQUIRED', 'SUSPENDED'].includes(
      proof.decision,
    )
  )
    throw invalid();
  if (
    !sameScope(current.scope, policy.scope) ||
    !sameScope(current.scope, proof.scope) ||
    proof.referralId !== current.referralId ||
    proof.policyVersionId !== policy.id ||
    proof.observedRevision !== current.revision ||
    proof.asOf !== at.toISOString() ||
    proof.decision !== 'QUALIFIED' ||
    !policy.active ||
    current.review !== 'CLEAR'
  )
    throw conflict();
  if (current.state === 'REVOKED') throw conflict();
  if (current.state === 'CONFIRMED') {
    if (current.confirmedPolicyVersionId !== policy.id) throw conflict();
    return result(false);
  }
  value.state = 'CONFIRMED';
  value.confirmedPolicyVersionId = policy.id;
  value.confirmedAt = at.toISOString();
  return result(true);
}
