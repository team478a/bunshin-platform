import { ApplicationError } from '@bunshin/shared';
import type { ImprovementSafeObservation } from '@bunshin/platform-domain';
import {
  CollectImprovementObservations,
  validateImprovementReadRequest,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
  type ImprovementScopeAuthorizationPort,
} from './improvement-engine';
import { IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION as definition } from './improvement-feedback-observations';

/** Review routing only: these thresholds are neither significance nor anonymity guarantees. */
export const IMPROVEMENT_FEEDBACK_REVIEW_RULE = Object.freeze({
  key: 'SELECTED_FEEDBACK_REVIEW',
  version: 'selected-feedback-review-v1',
  minimumReports: 3,
  minimumDistinctReporters: 2,
});
type HoldReason = 'READ_INCOMPLETE' | 'SMALL_REPORT_SAMPLE' | 'SMALL_REPORTER_SAMPLE';
const digest = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hashed = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function codes(row: ImprovementSafeObservation) {
  const category = row.metadata['reportedCategory'];
  const surface = row.metadata['reportedSurface'];
  const impact = row.metadata['reportedImpact'];
  if (
    typeof category !== 'string' ||
    typeof surface !== 'string' ||
    typeof impact !== 'string' ||
    row.source.kind !== 'IMPROVEMENT_FEEDBACK' ||
    row.source.revision !== null ||
    row.feature !== 'TROUBLE_FEEDBACK' ||
    row.action !== 'REPORT' ||
    row.eventType !== 'FEEDBACK_RECEIVED' ||
    row.status !== 'REPORTED' ||
    row.category !== 'UNKNOWN' ||
    row.purpose !== 'PRODUCT_IMPROVEMENT' ||
    row.subtype !== 'SELF_REPORTED_TROUBLE' ||
    row.userRef === null ||
    row.bunshinRef === null ||
    row.entityRef !== row.source.id ||
    row.correlation.kind !== 'EXPLICIT_REFERENCE' ||
    row.correlation.key !== row.source.id ||
    row.errorCode !== null ||
    row.releaseSha !== null
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback evidence source');
  return { category, surface, impact };
}

/** Internal, nonpersistent evidence. Caller authorization + source adapter authorization are required. */
export class BuildImprovementFeedbackReviewEvidence {
  constructor(
    private readonly authorization: ImprovementScopeAuthorizationPort,
    private readonly adapter: ImprovementObservationAdapter,
  ) {}

  async execute(input: ImprovementReadRequest) {
    validateImprovementReadRequest(input);
    const request: ImprovementReadRequest = {
      ...input,
      scope: { ...input.scope },
      subject: input.subject ? { ...input.subject } : null,
      fromInclusive: new Date(input.fromInclusive),
      toExclusive: new Date(input.toExclusive),
    };
    if (
      this.adapter.definition.key !== definition.key ||
      this.adapter.definition.packageKey !== definition.packageKey ||
      this.adapter.definition.version !== definition.version
    )
      throw new ApplicationError('VALIDATION_ERROR', 'feedback evidence adapter mismatch');
    // The expected definition, not an injected adapter's relaxed allowlist, is the contract.
    const collection = await new CollectImprovementObservations(this.authorization, {
      definition,
      readObservations: (request) => this.adapter.readObservations(request),
    }).execute(request);
    const rows = collection.observations;
    const groups = new Map<
      string,
      { labels: ReturnType<typeof codes>; rows: ImprovementSafeObservation[] }
    >();
    for (const row of rows) {
      const labels = codes(row);
      const key = JSON.stringify([labels.category, labels.surface, labels.impact]);
      const group = groups.get(key) ?? { labels, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }
    const rule = { ...IMPROVEMENT_FEEDBACK_REVIEW_RULE };
    const coverage = { ...collection.coverage };
    const period = {
      fromInclusive: request.fromInclusive.toISOString(),
      toExclusive: request.toExclusive.toISOString(),
    };
    const selection = request.subject
      ? {
          kind: 'SUBJECT' as const,
          revision: await digest([request.subject.userRef, request.subject.bunshinRef]),
        }
      : { kind: 'SERVICE' as const, revision: null };
    const scope = {
      tenantRef: request.scope.tenantRef,
      workspaceId: request.scope.workspaceId,
      serviceId: request.scope.serviceId,
      packageKey: request.scope.packageKey,
      adapterKey: request.scope.adapterKey,
      environment: request.scope.environment,
    };
    const context = [
      [
        scope.tenantRef,
        scope.workspaceId,
        scope.serviceId,
        scope.packageKey,
        scope.adapterKey,
        scope.environment,
      ],
      definition.version,
      rule,
      period,
      selection,
    ];
    const buckets = await Promise.all(
      [...groups.entries()]
        .sort(([a], [b]) => compare(a, b))
        .map(async ([, group]) => {
          const ordered = [...group.rows].sort((a, b) => compare(a.eventId, b.eventId));
          const distinctReporters = new Set(ordered.map((row) => row.userRef)).size;
          const holdReasons: HoldReason[] = [];
          if (coverage.completeness !== 'COMPLETE') holdReasons.push('READ_INCOMPLETE');
          if (ordered.length < rule.minimumReports) holdReasons.push('SMALL_REPORT_SAMPLE');
          if (distinctReporters < rule.minimumDistinctReporters)
            holdReasons.push('SMALL_REPORTER_SAMPLE');
          const sourceRefs = ordered.map((row) => ({
            kind: row.source.kind,
            id: row.source.id,
            revision: row.source.revision,
            occurredAt: row.occurredAt.toISOString(),
          }));
          const clusterRef = await digest([context, group.labels]);
          const evidenceRevision = await digest([
            clusterRef,
            coverage,
            ordered.map((row) => [
              row.source.kind,
              row.source.id,
              row.source.revision,
              row.occurredAt.toISOString(),
              row.userRef,
              row.bunshinRef,
            ]),
          ]);
          return {
            clusterRef,
            evidenceRevision,
            labels: group.labels,
            reviewDecision:
              holdReasons.length === 0 ? ('REVIEW_REQUIRED' as const) : ('HELD' as const),
            holdReasons,
            classification: 'UNKNOWN' as const,
            evidenceKind: 'SELF_REPORTED_TROUBLE' as const,
            reports: ordered.length,
            distinctReporters,
            distinctBunshins: new Set(ordered.map((row) => row.bunshinRef)).size,
            sourceRefs,
            technicalValidation: 'NOT_PERFORMED' as const,
            externalProviderCause: 'UNKNOWN' as const,
          };
        }),
    );
    return {
      scope,
      period,
      selection,
      rule,
      adapterVersion: definition.version,
      coverage,
      evidenceRevision: await digest([
        context,
        coverage,
        buckets.map((bucket) => bucket.evidenceRevision),
      ]),
      state:
        buckets.length > 0
          ? ('REPORTS_OBSERVED' as const)
          : coverage.completeness === 'COMPLETE'
            ? ('NO_STORED_REPORTS' as const)
            : ('INSUFFICIENT_DATA' as const),
      reports: rows.length,
      distinctReporters: new Set(rows.map((row) => row.userRef)).size,
      duplicateCount: collection.duplicateCount,
      buckets,
      populationCoverage: 'UNKNOWN' as const,
      denominator: null,
      troubleIncidenceRate: null,
      resolutionRate: null,
      cost: { estimatedUsdMicros: null, confirmedUsdMicros: null, unresolvedCount: null },
    };
  }
}
