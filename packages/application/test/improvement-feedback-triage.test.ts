import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sameImprovementScope, type ImprovementTriageCandidate } from '@bunshin/platform-domain';
import {
  BuildImprovementFeedbackReviewEvidence,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION as definition,
  projectImprovementFeedbackObservation,
  ReviewImprovementFeedbackCandidate,
  type ImprovementFeedbackTriageRepository,
  type ImprovementFeedbackTriageTransaction,
  type ReviewImprovementFeedbackInput,
  type ImprovementTriageOperation,
  type ImprovementTriagePolicy,
} from '../src/index';
const now = new Date('2026-10-03T01:30:00Z');
const scope = {
  tenantRef: 'ws',
  workspaceId: 'ws',
  serviceId: 'service',
  packageKey: 'SOCIAL',
  adapterKey: 'TROUBLE_FEEDBACK',
  environment: 'DEVELOPMENT' as const,
};
const id = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const from = new Date('2026-09-20T15:00:00Z');
const to = new Date('2026-09-27T15:00:00Z');
const row = (index: number) =>
  projectImprovementFeedbackObservation(scope, {
    id: `private-source-${index}`,
    actorUserId: `private-user-${index}`,
    bunshinId: `private-bunshin-${index}`,
    createdAt: new Date('2026-09-23Z'),
    category: 'OPERATION',
    surface: 'TODAY',
    impact: 'BLOCKED',
  });
/** Test-only serialized transaction contract. Not a proof of Prisma isolation or deletion hooks. */
class AtomicFake implements ImprovementFeedbackTriageRepository {
  rows = Array.from({ length: 5 }, (_, index) => row(index));
  partial = false;
  role = 'SERVICE_ADMIN';
  policyValue: ImprovementTriagePolicy | null = {
    approved: true,
    retentionPolicyVersion: 'synthetic-reviewed-v1',
    disclosurePolicyVersion: 'feedback-admin-preview-v1',
    minimumBucketReporters: 5,
    candidateRetentionDays: 20,
  };
  stored!: ImprovementTriageCandidate;
  operations = new Map<string, ImprovementTriageOperation>();
  commits = 0;
  failAudit = false;
  failCas = false;
  afterEvidence: (() => void) | null = null;
  evidenceReads = 0;
  private queue = Promise.resolve();
  async readEvidence() {
    return new BuildImprovementFeedbackReviewEvidence(
      { authorize: () => Promise.resolve(true) },
      {
        definition,
        readObservations: () =>
          Promise.resolve({
            observations: this.rows,
            coverage: {
              completeness: this.partial ? 'PARTIAL' : 'COMPLETE',
              missingCount: this.partial ? null : 0,
              truncated: this.partial,
            },
          }),
      },
    ).execute({
      scope,
      actorUserId: 'manager',
      fromInclusive: from,
      toExclusive: to,
      subject: null,
      limit: 1000,
    });
  }
  async init() {
    const evidence = await this.readEvidence();
    this.stored = {
      id,
      scope: { ...scope },
      period: { fromInclusive: from, toExclusive: to },
      clusterRef: evidence.buckets[0]!.clusterRef,
      windowEvidenceRevision: evidence.evidenceRevision,
      bucketEvidenceRevision: evidence.buckets[0]!.evidenceRevision,
      adapterVersion: evidence.adapterVersion,
      ruleVersion: evidence.rule.version,
      disclosurePolicyVersion: 'feedback-admin-preview-v1',
      retentionPolicyVersion: 'synthetic-reviewed-v1',
      candidateRevision: 1,
      state: 'OPEN',
      expiresAt: new Date('2026-10-10Z'),
    };
    return this;
  }
  input(): ReviewImprovementFeedbackInput {
    return {
      scope: { ...scope },
      actorUserId: 'manager',
      candidateId: id,
      operationKey: key,
      expectedCandidateRevision: 1,
      expectedWindowEvidenceRevision: this.stored.windowEvidenceRevision!,
      expectedBucketEvidenceRevision: this.stored.bucketEvidenceRevision!,
      action: 'MARK_REVIEWED',
      reasonCode: 'REVIEW_COMPLETED',
    };
  }
  async transaction<T>(
    context: { scope: typeof scope; actorUserId: string },
    work: (tx: ImprovementFeedbackTriageTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    let stored = structuredClone(this.stored);
    const operations = structuredClone(this.operations);
    let commits = 0;
    try {
      const result = await work({
        authorize: () =>
          Promise.resolve(
            sameImprovementScope(scope, context.scope) &&
              context.actorUserId === 'manager' &&
              ['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(this.role),
          ),
        policy: () => Promise.resolve(structuredClone(this.policyValue)),
        candidate: (candidateId) =>
          Promise.resolve(candidateId === stored.id ? structuredClone(stored) : null),
        evidence: async (request) => {
          expect(request).toEqual({
            scope,
            actorUserId: 'manager',
            fromInclusive: from,
            toExclusive: to,
            subject: null,
            limit: 1000,
          });
          this.evidenceReads++;
          const result = await this.readEvidence();
          this.afterEvidence?.();
          return result;
        },
        operation: (operationKey) => Promise.resolve(operations.get(operationKey) ?? null),
        commit: (input) => {
          if (
            this.failCas ||
            stored.candidateRevision !== input.expectedRevision ||
            operations.has(input.operationKey)
          )
            return Promise.resolve(false);
          stored = {
            ...stored,
            state: input.operation.receipt.state,
            candidateRevision: input.operation.receipt.candidateRevision,
          };
          if (this.failAudit) throw new Error('injected audit failure');
          operations.set(input.operationKey, structuredClone(input.operation));
          commits++;
          return Promise.resolve(true);
        },
      });
      this.stored = stored;
      this.operations = operations;
      this.commits += commits;
      return result;
    } finally {
      release();
    }
  }
}
const run = (fake: AtomicFake, input = fake.input()) =>
  new ReviewImprovementFeedbackCandidate(fake, () => new Date(now)).execute(input);
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('network forbidden');
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
describe('internal feedback triage contract with atomic fake only', () => {
  it('reviews and replays after response loss from a new execution, without new commit/audit or private output', async () => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    const result = await run(fake, input);
    expect(result).toEqual({ candidateId: id, candidateRevision: 2, state: 'REVIEWED' });
    expect(await run(fake, input)).toEqual(result);
    expect(fake.commits).toBe(1);
    expect(fake.operations.size).toBe(1);
    expect(fake.evidenceReads).toBe(2);
    expect(JSON.stringify(result)).not.toMatch(/private|Evidence|scope|[a-f0-9]{64}/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('dismisses only with a fixed reason, without implementation approval', async () => {
    const fake = await new AtomicFake().init();
    expect(
      (await run(fake, { ...fake.input(), action: 'DISMISS', reasonCode: 'OUT_OF_SCOPE' })).state,
    ).toBe('DISMISSED');
  });
  it.each(['CONTENT_EDITOR', 'PARTICIPANT', 'REVOKED', 'PLATFORM_ADMIN'])(
    'denies %s before source or operation read, including replay',
    async (role) => {
      const fake = await new AtomicFake().init();
      const input = fake.input();
      await run(fake, input);
      fake.role = role;
      await expect(run(fake, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(fake.evidenceReads).toBe(1);
      expect(fake.commits).toBe(1);
    },
  );
  it.each([
    'tenantRef',
    'workspaceId',
    'serviceId',
    'environment',
    'adapterKey',
    'packageKey',
  ] as const)('rejects a different %s', async (field) => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    await expect(
      run(fake, { ...input, scope: { ...input.scope, [field]: 'other' } }),
    ).rejects.toThrow();
    expect(fake.commits).toBe(0);
  });
  it.each(['APPROVED', 'STALE', 'REVIEWED', 'DISMISSED'])(
    'never auto-approves/reopens %s',
    async (state) => {
      const fake = await new AtomicFake().init();
      fake.stored.state = state as never;
      await expect(run(fake)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(fake.commits).toBe(0);
    },
  );
  it.each(['missing', 'unapproved', 'too-small', 'invalid-retention', 'wrong-version'])(
    'refuses %s policy rather than selecting a default',
    async (change) => {
      const fake = await new AtomicFake().init();
      if (change === 'missing') fake.policyValue = null;
      else if (change === 'unapproved') fake.policyValue!.approved = false;
      else if (change === 'too-small') fake.policyValue!.minimumBucketReporters = 2;
      else if (change === 'invalid-retention') fake.policyValue!.candidateRetentionDays = 0;
      else fake.policyValue!.disclosurePolicyVersion = 'future-v2';
      await expect(run(fake)).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
      expect(fake.evidenceReads).toBe(0);
    },
  );
  it.each([
    'source-added',
    'source-deleted',
    'same-count-replaced',
    'owner-changed',
    'incomplete',
    'small-other-bucket',
  ])('rejects %s evidence without trusting the old hash', async (change) => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    if (change === 'source-added') fake.rows.push(row(5));
    if (change === 'source-deleted') fake.rows.pop();
    if (change === 'same-count-replaced') fake.rows[0] = row(9);
    if (change === 'owner-changed') fake.rows[0]!.userRef = 'other-owner';
    if (change === 'incomplete') fake.partial = true;
    if (change === 'small-other-bucket') {
      const extra = row(9);
      extra.metadata = { ...extra.metadata, reportedCategory: 'CONTENT' };
      fake.rows.push(extra);
      // Even a refreshed whole-window hash must not allow hidden cells to bypass disclosure.
      input.expectedWindowEvidenceRevision = (await fake.readEvidence()).evidenceRevision;
      fake.stored.windowEvidenceRevision = input.expectedWindowEvidenceRevision;
    }
    await expect(run(fake, input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fake.commits).toBe(0);
  });
  it.each(['audit', 'cas'])(
    'leaves both candidate and operation unchanged on %s failure',
    async (failure) => {
      const fake = await new AtomicFake().init();
      fake.failAudit = failure === 'audit';
      fake.failCas = failure === 'cas';
      await expect(run(fake)).rejects.toThrow();
      expect(fake.stored.candidateRevision).toBe(1);
      expect(fake.operations.size).toBe(0);
    },
  );
  it('serializes concurrent reviewers without sleeps, with one CAS winner', async () => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    const results = await Promise.allSettled([
      run(fake, input),
      run(fake, { ...input, operationKey: '33333333-3333-4333-8333-333333333333' }),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(fake.commits).toBe(1);
    expect(fake.operations.size).toBe(1);
  });
  it('refuses same operation with altered content or after a later revision', async () => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    await run(fake, input);
    await expect(
      run(fake, { ...input, action: 'DISMISS', reasonCode: 'OUT_OF_SCOPE' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    fake.stored.candidateRevision++;
    await expect(run(fake, input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fake.commits).toBe(1);
  });
  it.each([
    'expired',
    'null-hash',
    'policy-changed',
    'unbounded-expiry',
    'current-week',
    'arbitrary-period',
  ])('rejects %s before reading original evidence', async (change) => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    if (change === 'expired') fake.stored.expiresAt = new Date(now);
    if (change === 'null-hash') fake.stored.windowEvidenceRevision = null;
    if (change === 'policy-changed') fake.stored.retentionPolicyVersion = 'old-v1';
    if (change === 'unbounded-expiry') fake.stored.expiresAt = new Date('2030-01-01Z');
    if (change === 'current-week') {
      fake.stored.period.fromInclusive = to;
      fake.stored.period.toExclusive = new Date(to.getTime() + 7 * 86400000);
    }
    if (change === 'arbitrary-period')
      fake.stored.period.fromInclusive = new Date(from.getTime() + 1000);
    await expect(run(fake, input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fake.evidenceReads).toBe(0);
  });
  it('rechecks revocation inside the transaction before returning a replay', async () => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    await run(fake, input);
    fake.afterEvidence = () => {
      fake.role = 'REVOKED';
    };
    await expect(run(fake, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(fake.commits).toBe(1);
  });
  it('rejects unknown coverage even when hashes have not changed', async () => {
    const fake = await new AtomicFake().init();
    const evidence = await fake.readEvidence();
    fake.readEvidence = () =>
      Promise.resolve({
        ...evidence,
        coverage: { completeness: 'UNKNOWN', missingCount: null, truncated: false },
      });
    await expect(run(fake)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fake.commits).toBe(0);
  });
  it('refuses expiry reached while current evidence is being read', async () => {
    const fake = await new AtomicFake().init();
    let clock = new Date(now);
    fake.afterEvidence = () => {
      clock = new Date(fake.stored.expiresAt);
    };
    await expect(
      new ReviewImprovementFeedbackCandidate(fake, () => clock).execute(fake.input()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fake.commits).toBe(0);
  });
  it('cannot overflow the CAS counter into a noninteger revision', async () => {
    const fake = await new AtomicFake().init();
    fake.stored.candidateRevision = Number.MAX_SAFE_INTEGER;
    await expect(
      run(fake, { ...fake.input(), expectedCandidateRevision: Number.MAX_SAFE_INTEGER }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(fake.commits).toBe(0);
  });
  it('snapshots request values before waiting, and rejects unknown runtime actions/reasons', async () => {
    const fake = await new AtomicFake().init();
    const input = fake.input();
    const pending = run(fake, input);
    input.scope.serviceId = 'mutated';
    input.action = 'DISMISS';
    expect((await pending).state).toBe('REVIEWED');
    await expect(run(fake, { ...fake.input(), action: 'APPROVE' as never })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      run(fake, { ...fake.input(), reasonCode: 'free text' as never }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
