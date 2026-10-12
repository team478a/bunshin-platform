import { describe, expect, it, vi } from 'vitest';
import type { ImprovementObservation } from '@bunshin/platform-domain';
import {
  BuildServiceImprovementOverview,
  SOCIAL_PROGRESS_OBSERVATION_DEFINITION as definition,
  type ServiceImprovementReadRequest,
  type ServiceImprovementSource,
} from '../src/service-improvement-overview';

const request: ServiceImprovementReadRequest = {
  actorUserId: 'admin',
  scope: {
    tenantRef: 'tenant',
    workspaceId: 'workspace',
    serviceId: 'service',
    environment: 'DEVELOPMENT',
  },
  fromInclusive: new Date('2026-09-01Z'),
  toExclusive: new Date('2026-10-01Z'),
  limit: 100,
};
function rows(count = 5): ImprovementObservation[] {
  return Array.from({ length: count }, (_, n) => ({
    scope: { ...request.scope, adapterKey: definition.key, packageKey: definition.packageKey },
    source: { kind: 'DAILY_MISSION', id: `mission-${n}`, revision: 'v1' },
    occurredAt: new Date('2026-09-03Z'),
    feature: 'RECORDED_PROGRESS',
    action: 'OBSERVE',
    eventType: 'COHORT_SNAPSHOT',
    status: 'RECORDED',
    category: 'UNKNOWN',
    purpose: 'PRODUCT_IMPROVEMENT',
    subtype: 'RECORDED_MISSION',
    errorCode: null,
    correlation: { kind: 'EXPLICIT_REFERENCE', key: `mission-${n}` },
    releaseSha: null,
    userRef: `user-${n}`,
    bunshinRef: `bunshin-${n}`,
    entityRef: `mission-${n}`,
    metadata: { accepted: true, rejected: false, posted: false, uncertain: false },
  }));
}
function setup(data = rows(), completeness: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' = 'COMPLETE') {
  const readObservations = vi.fn().mockResolvedValue({
    observations: data,
    coverage: {
      completeness,
      missingCount: completeness === 'COMPLETE' ? 0 : null,
      truncated: completeness === 'PARTIAL',
    },
  });
  const source: ServiceImprovementSource = {
    definition,
    adapter: { definition, readObservations },
    metrics: ['accepted', 'rejected', 'posted'].map((key) => ({ key, flag: key })),
    uncertainFlags: ['uncertain'],
  };
  const authorize = vi.fn().mockResolvedValue(true);
  return {
    source,
    readObservations,
    authorize,
    build: () => new BuildServiceImprovementOverview({ authorize }, [source]),
  };
}
describe('read-only service improvement overview', () => {
  it('separates acceptance from posting and never invents rates, cost, environment or capability', async () => {
    const result = await setup().build().execute(request);
    expect(result.sections[0]).toMatchObject({
      visibility: 'VISIBLE',
      observedRecords: 5,
      distinctSubjects: 5,
      denominator: { kind: 'RECORDED_COHORT', count: 5 },
      metrics: [
        { key: 'accepted', count: 5, rate: null },
        { key: 'rejected', count: 0, rate: null },
        { key: 'posted', count: 0, rate: null },
      ],
      populationCoverage: 'UNKNOWN',
      sourceEnvironment: 'UNKNOWN',
      cost: null,
    });
    expect(result).toMatchObject({
      diagnosis: 'NOT_PERFORMED',
      executionPermission: 'NOT_GRANTED',
      snapshotConsistency: 'PER_ADAPTER',
    });
    for (const ref of ['user-0', 'bunshin-0', 'mission-0', 'workspace', 'tenant'])
      expect(JSON.stringify(result)).not.toContain(ref);
  });
  it.each([0, 1, 4])('withholds counts and denominator for %s subjects', async (count) => {
    const section = (await setup(rows(count)).build().execute(request)).sections[0]!;
    expect(section).toMatchObject({
      visibility: 'WITHHELD',
      observedRecords: null,
      distinctSubjects: null,
      denominator: { count: null },
    });
    expect(section.metrics.every((metric) => metric.count === null)).toBe(true);
  });
  it('many records for one person do not satisfy the minimum', async () => {
    const data = rows(20).map((row) => ({ ...row, userRef: 'one-person' }));
    expect((await setup(data).build().execute(request)).sections[0]?.visibility).toBe('WITHHELD');
  });
  it('withholds a small complement that subtraction would expose', async () => {
    const data = rows(6);
    data[5]!.metadata = { ...data[5]!.metadata, accepted: false };
    expect((await setup(data).build().execute(request)).sections[0]?.holdReasons).toContain(
      'SMALL_SAMPLE',
    );
  });
  it.each(['PARTIAL', 'UNKNOWN'] as const)(
    'holds %s reads even with enough subjects',
    async (coverage) => {
      const section = (await setup(rows(10), coverage).build().execute(request)).sections[0]!;
      expect(section.observedRecords).toBeNull();
      expect(section.holdReasons).toContain('READ_INCOMPLETE');
    },
  );
  it.each(['uncertain', 'missing', 'subject'])('holds %s sources', async (reason) => {
    const data = rows();
    if (reason === 'uncertain') data[0]!.metadata = { ...data[0]!.metadata, uncertain: true };
    if (reason === 'missing')
      data[0]!.metadata = { rejected: false, posted: false, uncertain: false };
    if (reason === 'subject') data[0]!.userRef = null;
    expect((await setup(data).build().execute(request)).sections[0]?.holdReasons).toContain(
      'SOURCE_UNCERTAIN',
    );
  });
  it('deduplicates exact source replay without counting it as another user or exposing a duplicate total', async () => {
    const data = rows();
    const result = await setup([...data, data[0]!])
      .build()
      .execute(request);
    expect(result.sections[0]?.observedRecords).toBe(5);
    expect(JSON.stringify(result)).not.toContain('duplicateCount');
  });
  it.each([
    'tenantRef',
    'workspaceId',
    'serviceId',
    'packageKey',
    'adapterKey',
    'environment',
  ] as const)('rejects a source from a different %s', async (key) => {
    const data = rows();
    data[0]!.scope = {
      ...data[0]!.scope,
      [key]: key === 'environment' ? 'STAGING' : 'other',
    };
    await expect(setup(data).build().execute(request)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it('denies authorization before reading', async () => {
    const s = setup();
    s.authorize.mockResolvedValue(false);
    await expect(s.build().execute(request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(s.readObservations).not.toHaveBeenCalled();
  });
  it('propagates DB failure, not UNKNOWN or an empty success', async () => {
    const s = setup();
    s.readObservations.mockRejectedValue(new Error('storage failed'));
    await expect(s.build().execute(request)).rejects.toThrow('storage failed');
  });
  it('rejects extra metadata rather than silently sanitizing an unsafe export', async () => {
    const data = rows();
    data[0]!.metadata = { ...data[0]!.metadata, answer: 'private' };
    await expect(setup(data).build().execute(request)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
  it.each(['subject', 'secret'])('rejects extra request field %s', async (key) => {
    const s = setup();
    await expect(s.build().execute({ ...request, [key]: 'private' })).rejects.toBeDefined();
    expect(s.readObservations).not.toHaveBeenCalled();
  });
  it('rejects an extra scope field and a relaxed adapter version', async () => {
    const s = setup();
    await expect(
      s.build().execute({
        ...request,
        scope: { ...request.scope, extra: 'private' },
      } as ServiceImprovementReadRequest),
    ).rejects.toBeDefined();
    s.source.adapter = { ...s.source.adapter, definition: { ...definition, version: 'relaxed' } };
    await expect(s.build().execute(request)).rejects.toBeDefined();
    expect(s.readObservations).not.toHaveBeenCalled();
  });
  it('protects input across asynchronous authorization', async () => {
    const s = setup();
    const input = {
      ...request,
      scope: { ...request.scope },
      fromInclusive: new Date(request.fromInclusive),
    };
    s.authorize.mockImplementation(() => {
      input.scope.serviceId = 'other';
      input.actorUserId = 'other';
      input.fromInclusive.setFullYear(2030);
      return Promise.resolve(true);
    });
    const result = await s.build().execute(input);
    expect(s.readObservations.mock.calls[0]?.[0]).toMatchObject({
      actorUserId: 'admin',
      scope: { serviceId: 'service' },
    });
    expect(result.period.fromInclusive).toBe(request.fromInclusive.toISOString());
  });
  it('performs no external calls', async () => {
    const fetch = vi.fn(() => {
      throw new Error('external call forbidden');
    });
    vi.stubGlobal('fetch', fetch);
    try {
      await setup().build().execute(request);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('rejects duplicate or invalid source registries before reads', async () => {
    const s = setup();
    await expect(
      new BuildServiceImprovementOverview({ authorize: s.authorize }, [s.source, s.source]).execute(
        request,
      ),
    ).rejects.toBeDefined();
    s.source.privacyDimensions = ['accepted'];
    await expect(s.build().execute(request)).rejects.toBeDefined();
    expect(s.readObservations).not.toHaveBeenCalled();
  });
  it('holds a small code bucket and an unknown code without exporting dimensions', async () => {
    const coded = {
      ...definition,
      metadataRules: {
        ...definition.metadataRules,
        bucket: { kind: 'CODE' as const, values: ['KNOWN', 'UNKNOWN'] },
      },
    };
    const data = rows(10).map((row, i) => ({
      ...row,
      metadata: { ...row.metadata, bucket: i === 0 ? 'UNKNOWN' : 'KNOWN' },
    }));
    const s = setup(data);
    s.source.definition = coded;
    s.source.adapter = { definition: coded, readObservations: s.readObservations };
    s.source.privacyDimensions = ['bucket'];
    s.source.uncertainCodes = [{ field: 'bucket', known: ['KNOWN'] }];
    const result = await s.build().execute(request);
    expect(result.sections[0]?.holdReasons).toEqual(
      expect.arrayContaining(['SMALL_SAMPLE', 'SOURCE_UNCERTAIN']),
    );
    expect(result.sections[0]?.observedRecords).toBeNull();
    expect(JSON.stringify(result)).not.toContain('bucket');
  });
});
