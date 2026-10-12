import {
  sameImprovementScope,
  sanitizeImprovementObservation,
  type ImprovementAdapterDefinition,
  type ImprovementScope,
} from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import {
  CollectImprovementObservations,
  validateImprovementReadRequest,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
  type ImprovementScopeAuthorizationPort,
} from './improvement-engine';

export const SERVICE_IMPROVEMENT_OVERVIEW_VERSION = 'service-improvement-overview-v1';
export const SOCIAL_PROGRESS_OBSERVATION_DEFINITION: ImprovementAdapterDefinition = {
  key: 'SOCIAL_PROGRESS',
  version: 'social-progress-v1',
  packageKey: 'SOCIAL',
  subtypes: ['RECORDED_MISSION'],
  metadataRules: Object.fromEntries(
    ['accepted', 'rejected', 'posted', 'uncertain'].map((key) => [key, { kind: 'BOOLEAN' }]),
  ),
};
export const TRAINING_PROGRESS_OBSERVATION_DEFINITION: ImprovementAdapterDefinition = {
  key: 'TRAINING_PROGRESS',
  version: 'training-progress-v1',
  packageKey: 'TRAINING',
  subtypes: ['RECORDED_ASSIGNMENT'],
  metadataRules: Object.fromEntries(
    ['started', 'completed', 'submitted', 'evaluationReady', 'evaluationFailed', 'uncertain'].map(
      (key) => [key, { kind: 'BOOLEAN' }],
    ),
  ),
};
export type ServiceImprovementReadRequest = Omit<ImprovementReadRequest, 'scope' | 'subject'> & {
  scope: Omit<ImprovementScope, 'packageKey' | 'adapterKey'>;
};
export interface ServiceImprovementSource {
  /** Expected definition is server-owned, not the adapter's relaxed allowlist. */
  definition: ImprovementAdapterDefinition;
  adapter: ImprovementObservationAdapter;
  metrics: readonly { key: string; flag: string }[];
  uncertainFlags: readonly string[];
  uncertainCodes?: readonly { field: string; known: readonly string[] }[];
  privacyDimensions?: readonly string[];
}

/** Internal read-only aggregate. Neither an external export nor development approval. */
export class BuildServiceImprovementOverview {
  constructor(
    private readonly authorization: ImprovementScopeAuthorizationPort,
    private readonly sources: readonly ServiceImprovementSource[],
  ) {}
  async execute(input: ServiceImprovementReadRequest) {
    const actorUserId = input.actorUserId;
    const scope = {
      tenantRef: input.scope.tenantRef,
      workspaceId: input.scope.workspaceId,
      serviceId: input.scope.serviceId,
      environment: input.scope.environment,
    };
    const fromInclusive = new Date(input.fromInclusive);
    const toExclusive = new Date(input.toExclusive);
    const limit = input.limit;
    if (
      Object.keys(input).some(
        (k) => !['actorUserId', 'scope', 'fromInclusive', 'toExclusive', 'limit'].includes(k),
      ) ||
      Object.keys(input.scope).some(
        (k) => !['tenantRef', 'workspaceId', 'serviceId', 'environment'].includes(k),
      ) ||
      this.sources.length < 1 ||
      this.sources.length > 8
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service overview request');
    const keys = new Set<string>();
    // Validate every source before reads. Registry is trusted server composition only.
    for (const source of this.sources) {
      const d = source.definition;
      if (
        keys.has(d.key) ||
        d.key !== source.adapter.definition.key ||
        d.packageKey !== source.adapter.definition.packageKey ||
        d.version !== source.adapter.definition.version ||
        source.metrics.some(
          (m) =>
            !/^[a-zA-Z][a-zA-Z0-9-]{0,79}$/.test(m.key) ||
            d.metadataRules[m.flag]?.kind !== 'BOOLEAN',
        ) ||
        new Set(source.metrics.map((m) => m.key)).size !== source.metrics.length ||
        source.uncertainFlags.some((flag) => d.metadataRules[flag]?.kind !== 'BOOLEAN') ||
        (source.privacyDimensions ?? []).some((field) => d.metadataRules[field]?.kind !== 'CODE') ||
        (source.uncertainCodes ?? []).some(({ field, known }) => {
          const rule = d.metadataRules[field];
          return (
            rule?.kind !== 'CODE' || !known.length || known.some((c) => !rule.values.includes(c))
          );
        })
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid service overview source');
      keys.add(d.key);
      validateImprovementReadRequest({
        actorUserId,
        scope: { ...scope, packageKey: d.packageKey, adapterKey: d.key },
        fromInclusive,
        toExclusive,
        limit,
        subject: null,
      });
    }
    const sections = [];
    for (const source of this.sources) {
      const request: ImprovementReadRequest = {
        actorUserId,
        scope: {
          ...scope,
          packageKey: source.definition.packageKey,
          adapterKey: source.definition.key,
        },
        fromInclusive: new Date(fromInclusive),
        toExclusive: new Date(toExclusive),
        limit,
        subject: null,
      };
      const collection = await new CollectImprovementObservations(this.authorization, {
        definition: source.definition,
        readObservations: async (request) => {
          const result = await source.adapter.readObservations(request);
          for (const row of result.observations) {
            if (
              Object.keys(row.metadata).some(
                (key) => !Object.hasOwn(source.definition.metadataRules, key),
              )
            )
              throw new ApplicationError('VALIDATION_ERROR', 'invalid overview observation');
          }
          return result;
        },
      }).execute(request);
      const rows = collection.observations;
      for (const row of rows) {
        if (
          !sameImprovementScope(row.scope, request.scope) ||
          Object.keys(row.metadata).some(
            (key) => !Object.hasOwn(source.definition.metadataRules, key),
          )
        )
          throw new ApplicationError('VALIDATION_ERROR', 'invalid overview observation');
        sanitizeImprovementObservation(row, source.definition);
      }
      const subjects = (items: typeof rows) => new Set(items.map((r) => r.userRef)).size;
      const unknownSubjects = rows.some((r) => r.userRef === null);
      const uncertain = rows.some(
        (r) =>
          source.uncertainFlags.some((f) => r.metadata[f] !== false) ||
          source.metrics.some(({ flag }) => typeof r.metadata[flag] !== 'boolean') ||
          (source.uncertainCodes ?? []).some(
            ({ field, known }) => !known.includes(String(r.metadata[field])),
          ),
      );
      const incomplete = collection.coverage.completeness !== 'COMPLETE';
      const dimensions = source.privacyDimensions ?? [];
      const privacyBuckets = new Map<string, typeof rows>();
      if (dimensions.length)
        for (const row of rows) {
          const key = JSON.stringify(dimensions.map((f) => row.metadata[f] ?? null));
          privacyBuckets.set(key, [...(privacyBuckets.get(key) ?? []), row]);
        }
      const small =
        subjects(rows) < 5 ||
        [...privacyBuckets.values()].some((bucket) => subjects(bucket) < 5) ||
        source.metrics.some(({ flag }) => {
          const selected = rows.filter((r) => r.metadata[flag] === true);
          const complement = rows.filter((r) => r.metadata[flag] === false);
          return (
            (selected.length > 0 && subjects(selected) < 5) ||
            (complement.length > 0 && subjects(complement) < 5)
          );
        });
      const visible = !incomplete && !uncertain && !unknownSubjects && !small;
      sections.push({
        adapterKey: source.definition.key,
        packageKey: source.definition.packageKey,
        sourceVersion: collection.adapterVersion,
        visibility: visible ? ('VISIBLE' as const) : ('WITHHELD' as const),
        holdReasons: [
          ...(incomplete ? ['READ_INCOMPLETE'] : []),
          ...(uncertain || unknownSubjects ? ['SOURCE_UNCERTAIN'] : []),
          ...(small ? ['SMALL_SAMPLE'] : []),
        ],
        completeness: collection.coverage.completeness,
        truncated: collection.coverage.truncated,
        observedRecords: visible ? rows.length : null,
        distinctSubjects: visible ? subjects(rows) : null,
        denominator: { kind: 'RECORDED_COHORT' as const, count: visible ? rows.length : null },
        metrics: source.metrics.map(({ key, flag }) => ({
          key,
          count: visible ? rows.filter((r) => r.metadata[flag] === true).length : null,
          rate: null,
        })),
        populationCoverage: 'UNKNOWN' as const,
        sourceEnvironment: 'UNKNOWN' as const,
        releaseSha: null,
        cost: null,
      });
    }
    return {
      version: SERVICE_IMPROVEMENT_OVERVIEW_VERSION,
      period: {
        fromInclusive: fromInclusive.toISOString(),
        toExclusive: toExclusive.toISOString(),
      },
      snapshotConsistency: 'PER_ADAPTER' as const,
      sections,
      diagnosis: 'NOT_PERFORMED' as const,
      executionPermission: 'NOT_GRANTED' as const,
    };
  }
}
