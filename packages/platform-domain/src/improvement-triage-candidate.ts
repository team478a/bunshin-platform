import { validateImprovementScope, type ImprovementScope } from './improvement-engine';

export type ImprovementTriageState = 'OPEN' | 'REVIEWED' | 'DISMISSED' | 'STALE';
export type ImprovementTriageAction = 'MARK_REVIEWED' | 'DISMISS';
export interface ImprovementTriageCandidate {
  id: string;
  scope: ImprovementScope;
  period: { fromInclusive: Date; toExclusive: Date };
  clusterRef: string;
  windowEvidenceRevision: string | null;
  bucketEvidenceRevision: string | null;
  adapterVersion: string;
  ruleVersion: string;
  disclosurePolicyVersion: string;
  retentionPolicyVersion: string;
  candidateRevision: number;
  state: ImprovementTriageState;
  expiresAt: Date;
}
export const isImprovementTriageDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isImprovementTriageUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export function validateImprovementTriageCandidate(candidate: ImprovementTriageCandidate): void {
  validateImprovementScope(candidate.scope);
  const { fromInclusive: from, toExclusive: to } = candidate.period;
  if (
    !isImprovementTriageUuid(candidate.id) ||
    !isImprovementTriageDigest(candidate.clusterRef) ||
    !['OPEN', 'REVIEWED', 'DISMISSED', 'STALE'].includes(candidate.state) ||
    !Number.isSafeInteger(candidate.candidateRevision) ||
    candidate.candidateRevision < 1 ||
    candidate.candidateRevision > Number.MAX_SAFE_INTEGER ||
    ![from, to, candidate.expiresAt].every(
      (date) => date instanceof Date && Number.isFinite(date.getTime()),
    ) ||
    from >= to ||
    candidate.expiresAt <= to ||
    [
      candidate.adapterVersion,
      candidate.ruleVersion,
      candidate.disclosurePolicyVersion,
      candidate.retentionPolicyVersion,
    ].some(
      (version) => typeof version !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(version),
    ) ||
    [candidate.windowEvidenceRevision, candidate.bucketEvidenceRevision].some(
      (revision) => revision !== null && !isImprovementTriageDigest(revision),
    ) ||
    (candidate.state !== 'STALE' &&
      (candidate.windowEvidenceRevision === null || candidate.bucketEvidenceRevision === null))
  )
    throw new Error('invalid improvement triage candidate');
}
/** Human review only. There is deliberately no APPROVED/development transition. */
export function improvementTriageNextState(
  state: ImprovementTriageState,
  action: ImprovementTriageAction,
): 'REVIEWED' | 'DISMISSED' | null {
  if (state !== 'OPEN') return null;
  if (action === 'MARK_REVIEWED') return 'REVIEWED';
  if (action === 'DISMISS') return 'DISMISSED';
  return null;
}
