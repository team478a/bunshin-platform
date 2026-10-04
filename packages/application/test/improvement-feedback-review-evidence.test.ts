import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImprovementCoverage, ImprovementObservation } from '@bunshin/platform-domain';
import {
  BuildImprovementFeedbackReviewEvidence,
  IMPROVEMENT_FEEDBACK_REVIEW_RULE as rule,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION as definition,
  projectImprovementFeedbackObservation,
  type ImprovementReadRequest,
} from '../src';

const scope = {
  tenantRef: 'tenant-a',
  workspaceId: 'workspace-a',
  serviceId: 'service-a',
  packageKey: 'SOCIAL',
  adapterKey: definition.key,
  environment: 'DEVELOPMENT' as const,
};
const input: ImprovementReadRequest = {
  actorUserId: 'manager-a',
  scope,
  fromInclusive: new Date('2026-10-01Z'),
  toExclusive: new Date('2026-10-03Z'),
  limit: 100,
  subject: null,
};
const complete: ImprovementCoverage = {
  completeness: 'COMPLETE',
  missingCount: 0,
  truncated: false,
};
function row(
  id: string,
  user = 'private-user-a',
  bunshin = 'private-bunshin-a',
  category = 'OPERATION',
) {
  return projectImprovementFeedbackObservation(scope, {
    id,
    actorUserId: user,
    bunshinId: bunshin,
    category,
    surface: 'TODAY',
    impact: 'BLOCKED',
    createdAt: new Date('2026-10-02Z'),
  });
}
function setup(observations: ImprovementObservation[] = [], coverage = complete, allowed = true) {
  const authorize = vi.fn(() => Promise.resolve(allowed));
  const readObservations = vi.fn(() => Promise.resolve({ observations, coverage }));
  const adapter = { definition, readObservations };
  return {
    useCase: new BuildImprovementFeedbackReviewEvidence({ authorize }, adapter),
    authorize,
    readObservations,
    adapter,
  };
}
const enough = () => [row('a'), row('b'), row('c', 'private-user-b', 'private-bunshin-b')];
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external communication forbidden');
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe('selected feedback review evidence (not confirmed issues)', () => {
  it('groups explicit codes, references originals, and routes only to human review', async () => {
    const { useCase } = setup(enough());
    const result = await useCase.execute(input);
    expect(rule).toEqual({
      key: 'SELECTED_FEEDBACK_REVIEW',
      version: 'selected-feedback-review-v1',
      minimumReports: 3,
      minimumDistinctReporters: 2,
    });
    expect(result).toMatchObject({
      reports: 3,
      distinctReporters: 2,
      adapterVersion: definition.version,
      populationCoverage: 'UNKNOWN',
      denominator: null,
      troubleIncidenceRate: null,
      resolutionRate: null,
      cost: { estimatedUsdMicros: null, confirmedUsdMicros: null, unresolvedCount: null },
      buckets: [
        {
          reports: 3,
          distinctReporters: 2,
          distinctBunshins: 2,
          labels: { category: 'OPERATION', surface: 'TODAY', impact: 'BLOCKED' },
          reviewDecision: 'REVIEW_REQUIRED',
          holdReasons: [],
          classification: 'UNKNOWN',
          technicalValidation: 'NOT_PERFORMED',
          externalProviderCause: 'UNKNOWN',
        },
      ],
    });
    expect(result.buckets[0]?.sourceRefs.map((source) => source.id)).toEqual(['a', 'b', 'c']);
    expect(result.evidenceRevision).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result)).not.toContain('private-user');
    expect(JSON.stringify(result)).not.toContain('private-bunshin');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('confidence');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('is stable across input order and duplicate delivery of the same source', async () => {
    const original = await setup(enough()).useCase.execute(input);
    const reordered = await setup([...enough()].reverse()).useCase.execute(input);
    const repeated = await setup([...enough(), row('a')]).useCase.execute(input);
    expect(reordered).toEqual(original);
    expect(repeated.duplicateCount).toBe(1);
    expect(repeated.reports).toBe(3);
    expect(repeated.evidenceRevision).toBe(original.evidenceRevision);
    expect(repeated.buckets).toEqual(original.buckets);
  });
  it('does not treat many Bunshins of one reporter as many people', async () => {
    const result = await setup([
      row('a'),
      row('b', 'private-user-a', 'private-bunshin-b'),
      row('c', 'private-user-a', 'private-bunshin-c'),
    ]).useCase.execute(input);
    expect(result.buckets[0]).toMatchObject({
      reports: 3,
      distinctReporters: 1,
      distinctBunshins: 3,
      reviewDecision: 'HELD',
      holdReasons: ['SMALL_REPORTER_SAMPLE'],
    });
  });
  it('retains a single blocked report as held evidence rather than silently discarding it', async () => {
    const result = await setup([row('a')]).useCase.execute(input);
    expect(result.buckets[0]).toMatchObject({
      reports: 1,
      reviewDecision: 'HELD',
      holdReasons: ['SMALL_REPORT_SAMPLE', 'SMALL_REPORTER_SAMPLE'],
      sourceRefs: [{ id: 'a' }],
    });
  });
  it.each(['PARTIAL', 'UNKNOWN'] as const)(
    'holds even a large group when read completeness is %s',
    async (completeness) => {
      const result = await setup(enough(), {
        completeness,
        missingCount: null,
        truncated: completeness === 'PARTIAL',
      }).useCase.execute(input);
      expect(result.buckets[0]).toMatchObject({
        reviewDecision: 'HELD',
        holdReasons: ['READ_INCOMPLETE'],
      });
    },
  );
  it('keeps distinct category/surface/impact buckets instead of pooling their thresholds', async () => {
    const a = row('a');
    const result = await setup([
      a,
      row('b', 'private-user-b', 'b', 'CONTENT'),
      { ...row('c'), metadata: { ...a.metadata, reportedSurface: 'PHOTO' } },
      { ...row('d'), metadata: { ...a.metadata, reportedImpact: 'SUGGESTION' } },
    ]).useCase.execute(input);
    expect(result.buckets).toHaveLength(4);
    expect(result.buckets.every((bucket) => bucket.reviewDecision === 'HELD')).toBe(true);
    expect(new Set(result.buckets.map((bucket) => bucket.clusterRef)).size).toBe(4);
  });
  it('changes evidence revision but not the cluster when a source or completeness changes', async () => {
    const original = await setup(enough()).useCase.execute(input);
    const revised = await setup([...enough(), row('d')]).useCase.execute(input);
    const partial = await setup(enough(), {
      completeness: 'PARTIAL',
      missingCount: null,
      truncated: true,
    }).useCase.execute(input);
    expect(revised.buckets[0]?.clusterRef).toBe(original.buckets[0]?.clusterRef);
    expect(partial.buckets[0]?.clusterRef).toBe(original.buckets[0]?.clusterRef);
    expect(revised.evidenceRevision).not.toBe(original.evidenceRevision);
    expect(partial.evidenceRevision).not.toBe(original.evidenceRevision);
  });
  it('includes source identity, ownership and time in revision, not merely the report count', async () => {
    const original = await setup(enough()).useCase.execute(input);
    const changed = [
      [...enough().slice(0, 2), row('different', 'private-user-b', 'private-bunshin-b')],
      [...enough().slice(0, 2), row('c', 'private-user-c', 'private-bunshin-b')],
      [...enough().slice(0, 2), row('c', 'private-user-b', 'different-bunshin')],
      [
        ...enough().slice(0, 2),
        {
          ...row('c', 'private-user-b', 'private-bunshin-b'),
          occurredAt: new Date('2026-10-02T01:00:00Z'),
        },
      ],
    ];
    for (const observations of changed) {
      const result = await setup(observations).useCase.execute(input);
      expect(result.reports).toBe(3);
      expect(result.evidenceRevision).not.toBe(original.evidenceRevision);
    }
  });
  it('separates period, subject selection and scopes in cluster identity', async () => {
    const original = await setup([row('a')]).useCase.execute(input);
    const period = await setup([row('a')]).useCase.execute({
      ...input,
      fromInclusive: new Date('2026-09-30Z'),
    });
    const subject = await setup([row('a')]).useCase.execute({
      ...input,
      subject: { userRef: 'private-user-a', bunshinRef: null },
    });
    const bunshin = await setup([row('a')]).useCase.execute({
      ...input,
      subject: { userRef: 'private-user-a', bunshinRef: 'private-bunshin-a' },
    });
    const foreignScope = { ...scope, serviceId: 'service-b' };
    const otherService = await setup([{ ...row('a'), scope: foreignScope }]).useCase.execute({
      ...input,
      scope: foreignScope,
    });
    expect(
      new Set(
        [original, period, subject, bunshin, otherService].map(
          (result) => result.buckets[0]?.clusterRef,
        ),
      ).size,
    ).toBe(5);
    expect(JSON.stringify(subject)).not.toContain('private-user-a');
    expect(subject.selection.kind).toBe('SUBJECT');
  });
  it.each(['COMPLETE', 'PARTIAL', 'UNKNOWN'] as const)(
    'distinguishes no stored reports from no reliable data (%s)',
    async (completeness) => {
      const result = await setup([], {
        completeness,
        missingCount: completeness === 'COMPLETE' ? 0 : null,
        truncated: completeness === 'PARTIAL',
      }).useCase.execute(input);
      expect(result.state).toBe(
        completeness === 'COMPLETE' ? 'NO_STORED_REPORTS' : 'INSUFFICIENT_DATA',
      );
      expect(result.buckets).toEqual([]);
      expect(result.troubleIncidenceRate).toBeNull();
    },
  );
  it('denies authorization before reading and propagates DB errors instead of returning empty evidence', async () => {
    const denied = setup(enough(), complete, false);
    await expect(denied.useCase.execute(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(denied.readObservations).not.toHaveBeenCalled();
    const failed = setup();
    failed.readObservations.mockRejectedValue(new Error('database unavailable'));
    await expect(failed.useCase.execute(input)).rejects.toThrow('database unavailable');
  });
  it.each([
    'tenantRef',
    'workspaceId',
    'serviceId',
    'packageKey',
    'adapterKey',
    'environment',
  ] as const)('rejects cross-%s source records', async (field) => {
    const foreign = {
      ...row('a'),
      scope: { ...scope, [field]: field === 'environment' ? 'STAGING' : 'foreign' },
    };
    await expect(setup([foreign]).useCase.execute(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('rejects conflicting repeats, out-of-period rows and subject violations', async () => {
    await expect(
      setup([row('a'), row('a', 'foreign-user')]).useCase.execute(input),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      setup([{ ...row('a'), occurredAt: input.toExclusive }]).useCase.execute(input),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      setup([row('a')]).useCase.execute({
        ...input,
        subject: { userRef: 'foreign-user', bunshinRef: null },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it.each([
    { category: 'BUG' },
    { source: { kind: 'JOB', id: 'a', revision: null } },
    { userRef: null },
    { bunshinRef: null },
    { errorCode: 'PROVIDER_TIMEOUT' },
    { source: { kind: 'IMPROVEMENT_FEEDBACK', id: 'a', revision: 'old' } },
    { correlation: { kind: 'JOB', key: 'a' } },
    { entityRef: 'different' },
    { status: 'FAILED' },
    { eventType: 'JOB_FAILED' },
    { feature: 'OTHER' },
    { action: 'GENERATE' },
    { purpose: 'USER_SUCCESS' },
  ] satisfies Partial<ImprovementObservation>[])(
    'refuses non-feedback semantics %# without inferring technical facts',
    async (changed) => {
      await expect(
        setup([{ ...row('a'), ...changed }]).useCase.execute(input),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    },
  );
  it('requires all code fields and uses its pinned allowlist even if an injected adapter loosens theirs', async () => {
    const missing = {
      ...row('a'),
      metadata: { reportedCategory: 'OPERATION', reportedSurface: 'TODAY' },
    };
    await expect(setup([missing]).useCase.execute(input)).rejects.toThrow(
      'invalid feedback evidence source',
    );
    const loose = setup([
      {
        ...row('a'),
        metadata: {
          reportedCategory: 'PRIVATE_RAW',
          reportedSurface: 'TODAY',
          reportedImpact: 'BLOCKED',
        },
      },
    ]);
    loose.adapter.definition = {
      ...definition,
      metadataRules: {
        ...definition.metadataRules,
        reportedCategory: { kind: 'CODE', values: ['PRIVATE_RAW'] },
      },
    };
    await expect(loose.useCase.execute(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('drops extra payload and does not return raw personal fields or metadata', async () => {
    const original = row('a');
    const result = await setup([
      {
        ...original,
        rawText: 'private-payload',
        metadata: { ...original.metadata, privateText: 'private-payload' },
      } as ImprovementObservation,
    ]).useCase.execute(input);
    expect(JSON.stringify(result)).not.toContain('private-payload');
    const scopeExtra = await setup([row('a')]).useCase.execute({
      ...input,
      scope: { ...scope, rawText: 'private-scope-extra' } as typeof scope,
    });
    expect(JSON.stringify(scopeExtra)).not.toContain('private-scope-extra');
  });
  it('rejects adapter version mismatches before collection', async () => {
    const test = setup();
    test.adapter.definition = { ...definition, version: 'unknown-v2' };
    await expect(test.useCase.execute(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(test.readObservations).not.toHaveBeenCalled();
  });
  it('snapshots caller scope, subject and period during asynchronous authorization', async () => {
    const test = setup([row('a')]);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    test.authorize.mockImplementation(async () => {
      await barrier;
      return true;
    });
    const mutable = {
      ...input,
      scope: { ...scope },
      subject: { userRef: 'private-user-a', bunshinRef: null },
      fromInclusive: new Date(input.fromInclusive),
    };
    const pending = test.useCase.execute(mutable);
    mutable.scope.serviceId = 'foreign';
    mutable.subject.userRef = 'foreign';
    mutable.fromInclusive.setUTCFullYear(2030);
    release();
    const result = await pending;
    expect(result.scope).toEqual(scope);
    expect(result.period.fromInclusive).toBe(input.fromInclusive.toISOString());
    expect(result.reports).toBe(1);
  });
});
