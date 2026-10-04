import { describe, expect, it } from 'vitest';
import {
  improvementTriageNextState,
  validateImprovementTriageCandidate,
  type ImprovementTriageCandidate,
} from '../src/index';
const candidate: ImprovementTriageCandidate = {
  id: '11111111-1111-4111-8111-111111111111',
  scope: {
    tenantRef: 'ws',
    workspaceId: 'ws',
    serviceId: 'service',
    packageKey: 'generic',
    adapterKey: 'generic',
    environment: 'DEVELOPMENT',
  },
  period: { fromInclusive: new Date('2026-09-21Z'), toExclusive: new Date('2026-09-28Z') },
  clusterRef: 'a'.repeat(64),
  windowEvidenceRevision: 'b'.repeat(64),
  bucketEvidenceRevision: 'c'.repeat(64),
  adapterVersion: 'v1',
  ruleVersion: 'v1',
  disclosurePolicyVersion: 'v1',
  retentionPolicyVersion: 'fixture-v1',
  candidateRevision: 1,
  state: 'OPEN',
  expiresAt: new Date('2026-10-10Z'),
};
describe('pure improvement triage candidate contract', () => {
  it('permits human review only, without a SOCIAL or provider dependency', () => {
    expect(() => validateImprovementTriageCandidate(candidate)).not.toThrow();
    expect(improvementTriageNextState('OPEN', 'MARK_REVIEWED')).toBe('REVIEWED');
    expect(improvementTriageNextState('OPEN', 'DISMISS')).toBe('DISMISSED');
  });
  it.each(['REVIEWED', 'DISMISSED', 'STALE'] as const)(
    'does not reuse %s as approval or another review',
    (state) => {
      expect(improvementTriageNextState(state, 'MARK_REVIEWED')).toBeNull();
      expect(improvementTriageNextState(state, 'DISMISS')).toBeNull();
    },
  );
  it('rejects implementation actions even at a runtime boundary', () => {
    expect(improvementTriageNextState('OPEN', 'APPROVE' as never)).toBeNull();
    expect(improvementTriageNextState('APPROVED' as never, 'MARK_REVIEWED')).toBeNull();
  });
  it.each([
    { candidateRevision: 0 },
    { candidateRevision: NaN },
    { candidateRevision: Number.MAX_SAFE_INTEGER + 1 },
    { clusterRef: 'source-id' },
    { windowEvidenceRevision: null },
    { bucketEvidenceRevision: 'bad' },
    { state: 'APPROVED' },
    { expiresAt: new Date('invalid') },
    { retentionPolicyVersion: 'private text' },
  ])('rejects malformed candidate %j', (change) => {
    expect(() =>
      validateImprovementTriageCandidate({ ...candidate, ...change } as ImprovementTriageCandidate),
    ).toThrow();
  });
  it('can represent erased evidence as stale without reviving it', () => {
    expect(() =>
      validateImprovementTriageCandidate({
        ...candidate,
        state: 'STALE',
        windowEvidenceRevision: null,
        bucketEvidenceRevision: null,
      }),
    ).not.toThrow();
  });
});
