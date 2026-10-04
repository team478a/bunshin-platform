import { describe, expect, it } from 'vitest';
import {
  CollectImprovementObservations,
  IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION as definition,
  projectImprovementFeedbackObservation,
  summarizeImprovementFeedback,
  type ImprovementReadRequest,
} from '../src';
const scope = {
  workspaceId: 'workspace-a',
  serviceId: 'service-a',
  tenantRef: 'tenant-a',
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
const source = {
  id: 'report-a',
  actorUserId: 'user-a',
  bunshinId: 'bunshin-a',
  createdAt: new Date('2026-10-02Z'),
  category: 'OPERATION',
  surface: 'TODAY',
  impact: 'BLOCKED',
};
describe('trouble feedback observation projection', () => {
  it.each(['OPERATION', 'CONTENT', 'WAITING', 'OTHER'])(
    'preserves %s as a self report, not a diagnosis',
    (category) => {
      const observation = projectImprovementFeedbackObservation(scope, {
        ...source,
        category,
        rawText: 'private',
        submissionKey: 'private',
      } as typeof source);
      expect(observation).toMatchObject({
        category: 'UNKNOWN',
        subtype: 'SELF_REPORTED_TROUBLE',
        status: 'REPORTED',
        errorCode: null,
        releaseSha: null,
        purpose: 'PRODUCT_IMPROVEMENT',
        source: { kind: 'IMPROVEMENT_FEEDBACK', id: 'report-a', revision: null },
        userRef: 'user-a',
        bunshinRef: 'bunshin-a',
        metadata: {
          reportedCategory: category,
          reportedSurface: 'TODAY',
          reportedImpact: 'BLOCKED',
        },
      });
      expect(JSON.stringify(observation)).not.toContain('private');
    },
  );
  it.each(['category', 'surface', 'impact'] as const)(
    'rejects unknown %s without putting raw values in errors',
    (field) => {
      expect(() =>
        projectImprovementFeedbackObservation(scope, { ...source, [field]: 'sensitive-data' }),
      ).toThrow('invalid feedback observation source');
    },
  );
  it('deduplicates one source, separates reports/people/Bunshin, and never estimates incidence or costs', async () => {
    const a = projectImprovementFeedbackObservation(scope, source);
    const b = projectImprovementFeedbackObservation(scope, {
      ...source,
      id: 'report-b',
      bunshinId: 'bunshin-b',
      category: 'WAITING',
    });
    const collection = await new CollectImprovementObservations(
      { authorize: () => Promise.resolve(true) },
      {
        definition,
        readObservations: () =>
          Promise.resolve({
            observations: [a, a, b],
            coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: false },
          }),
      },
    ).execute(input);
    const summary = summarizeImprovementFeedback(input, collection);
    expect(summary).toMatchObject({
      reports: 2,
      distinctReporters: 1,
      distinctBunshins: 2,
      duplicateCount: 1,
      troubleIncidenceRate: null,
      resolutionRate: null,
      populationCoverage: 'UNKNOWN',
      metric: {
        numerator: 2,
        denominator: null,
        cost: { estimatedUsdMicros: null, confirmedUsdMicros: null, unresolvedCount: null },
      },
    });
    expect(summary.byCategory.find(({ code }) => code === 'WAITING')).toEqual({
      code: 'WAITING',
      reports: 1,
      distinctReporters: 1,
    });
  });
  it.each(['COMPLETE', 'PARTIAL', 'UNKNOWN'] as const)(
    'keeps zero reports distinct from population completeness (%s)',
    (completeness) => {
      const summary = summarizeImprovementFeedback(input, {
        observations: [],
        duplicateCount: 0,
        adapterVersion: definition.version,
        coverage: {
          completeness,
          missingCount: completeness === 'COMPLETE' ? 0 : null,
          truncated: completeness === 'PARTIAL',
        },
      });
      expect(summary.reports).toBe(0);
      expect(summary.troubleIncidenceRate).toBeNull();
      expect(summary.populationCoverage).toBe('UNKNOWN');
      expect(summary.coverage.completeness).toBe(completeness);
    },
  );
  it('does not compare an unknown adapter version as if it were v1', () => {
    expect(() =>
      summarizeImprovementFeedback(input, {
        observations: [],
        duplicateCount: 0,
        adapterVersion: 'other-v1',
        coverage: { completeness: 'COMPLETE', missingCount: 0, truncated: false },
      }),
    ).toThrow('feedback observation version mismatch');
  });
});
