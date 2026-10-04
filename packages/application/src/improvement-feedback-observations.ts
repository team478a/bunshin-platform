import {
  sanitizeImprovementObservation,
  improvementMetricRate,
  type ImprovementAdapterDefinition,
  type ImprovementScope,
  type ImprovementMetricSnapshot,
} from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import {
  IMPROVEMENT_FEEDBACK_CATEGORIES,
  IMPROVEMENT_FEEDBACK_SURFACES,
  IMPROVEMENT_FEEDBACK_IMPACTS,
} from './improvement-feedback';
import type {
  ImprovementReadRequest,
  ImprovementObservationCollection,
} from './improvement-engine';

export const IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION: ImprovementAdapterDefinition = {
  key: 'TROUBLE_FEEDBACK',
  version: 'trouble-feedback-v1',
  packageKey: 'SOCIAL',
  subtypes: ['SELF_REPORTED_TROUBLE'],
  metadataRules: {
    reportedCategory: { kind: 'CODE', values: IMPROVEMENT_FEEDBACK_CATEGORIES },
    reportedSurface: { kind: 'CODE', values: IMPROVEMENT_FEEDBACK_SURFACES },
    reportedImpact: { kind: 'CODE', values: IMPROVEMENT_FEEDBACK_IMPACTS },
  },
};

/** Input is a minimized persistence projection, never a profile, message or material. */
export interface ImprovementFeedbackObservationSource {
  id: string;
  actorUserId: string;
  bunshinId: string;
  createdAt: Date;
  category: string;
  surface: string;
  impact: string;
}
export function projectImprovementFeedbackObservation(
  scope: ImprovementScope,
  row: ImprovementFeedbackObservationSource,
) {
  try {
    // Do not infer a diagnostic classification from the user's selected label.
    return sanitizeImprovementObservation(
      {
        scope,
        source: { kind: 'IMPROVEMENT_FEEDBACK', id: row.id, revision: null },
        occurredAt: row.createdAt,
        feature: 'TROUBLE_FEEDBACK',
        action: 'REPORT',
        eventType: 'FEEDBACK_RECEIVED',
        status: 'REPORTED',
        category: 'UNKNOWN',
        purpose: 'PRODUCT_IMPROVEMENT',
        subtype: 'SELF_REPORTED_TROUBLE',
        errorCode: null,
        correlation: { kind: 'EXPLICIT_REFERENCE', key: row.id },
        releaseSha: null,
        userRef: row.actorUserId,
        bunshinRef: row.bunshinId,
        entityRef: row.id,
        metadata: {
          reportedCategory: row.category,
          reportedSurface: row.surface,
          reportedImpact: row.impact,
        },
      },
      IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION,
    );
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback observation source');
  }
}

/** Only a CollectImprovementObservations-validated collection is accepted by composition. */
export function summarizeImprovementFeedback(
  input: ImprovementReadRequest,
  collection: ImprovementObservationCollection,
) {
  if (collection.adapterVersion !== IMPROVEMENT_FEEDBACK_OBSERVATION_DEFINITION.version)
    throw new ApplicationError('VALIDATION_ERROR', 'feedback observation version mismatch');
  const observations = collection.observations;
  const distinctReporters = new Set(observations.map((row) => row.userRef)).size;
  const metric: ImprovementMetricSnapshot = {
    scope: input.scope,
    metricKey: 'observed-trouble-reports',
    definitionVersion: collection.adapterVersion,
    fromInclusive: input.fromInclusive,
    toExclusive: input.toExclusive,
    numerator: observations.length,
    denominator: null,
    distinctSubjects: distinctReporters,
    coverage: collection.coverage,
    cost: { estimatedUsdMicros: null, confirmedUsdMicros: null, unresolvedCount: null },
  };
  const counts = (key: string, codes: readonly string[]) =>
    codes.map((code) => {
      const rows = observations.filter((row) => row.metadata[key] === code);
      return {
        code,
        reports: rows.length,
        distinctReporters: new Set(rows.map((row) => row.userRef)).size,
      };
    });
  return {
    reports: observations.length,
    distinctReporters,
    distinctBunshins: new Set(observations.map((row) => row.bunshinRef)).size,
    coverage: collection.coverage,
    duplicateCount: collection.duplicateCount,
    byCategory: counts('reportedCategory', IMPROVEMENT_FEEDBACK_CATEGORIES),
    bySurface: counts('reportedSurface', IMPROVEMENT_FEEDBACK_SURFACES),
    byImpact: counts('reportedImpact', IMPROVEMENT_FEEDBACK_IMPACTS),
    metric,
    troubleIncidenceRate: improvementMetricRate(metric),
    resolutionRate: null,
    populationCoverage: 'UNKNOWN' as const,
  };
}
