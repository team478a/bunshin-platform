import type {
  ImprovementObservationCollection,
  ImprovementReadRequest,
} from '@bunshin/application';
import {
  improvementMetricRate,
  type ImprovementAdapterDefinition,
  type ImprovementMetricSnapshot,
} from '@bunshin/platform-domain';

export const HASSY_PHOTO_QUALITY_DEFINITION: ImprovementAdapterDefinition = {
  key: 'HASSY_PHOTO_QUALITY',
  version: 'hassy-photo-quality-v1',
  packageKey: 'SOCIAL',
  subtypes: ['CONTENT_VARIANT_QUALITY'],
  metadataRules: {
    attribution: { kind: 'CODE', values: ['PHOTO_METADATA', 'PHOTO_ISSUE_SIGNAL', 'UNATTRIBUTED'] },
    qualityState: {
      kind: 'CODE',
      values: [
        'PASS',
        'REPAIRED_PASS',
        'FINAL_REVISE',
        'FINAL_REJECT',
        'UNCHECKED',
        'PENDING',
        'INVALID',
        'AFTER_CUTOFF',
      ],
    },
    unconfirmedFact: { kind: 'BOOLEAN' },
    hadIssues: { kind: 'BOOLEAN' },
    unknownIssueCount: { kind: 'COUNT', max: 20 },
    repairCount: { kind: 'COUNT', max: 1 },
    recordedPromptVersion: {
      kind: 'CODE',
      values: ['VARIANT_V1', 'CONTENT_V18', 'QUALITY_V13', 'PHOTO_ANALYSIS_V3', 'UNAVAILABLE'],
    },
  },
};

/** A quality code is a signal, not proof of the initiating route or the full Photo First cohort. */
export function projectHassyPhotoQuality(input: {
  hasPhotoMetadata: boolean;
  status: string;
  verdict: string | null;
  score: number | null;
  issueCodes: readonly string[];
  repairCount: number;
  updatedAt: Date;
  cutoff: Date;
  promptVersion: string | null;
}) {
  const unconfirmedFact = input.issueCodes.includes('PHOTO_FIRST_UNCONFIRMED_FACT');
  const attribution = input.hasPhotoMetadata
    ? 'PHOTO_METADATA'
    : unconfirmedFact
      ? 'PHOTO_ISSUE_SIGNAL'
      : 'UNATTRIBUTED';
  const validIssues =
    input.issueCodes.length <= 20 && input.issueCodes.every((code) => typeof code === 'string');
  const validRepair =
    Number.isInteger(input.repairCount) && input.repairCount >= 0 && input.repairCount <= 1;
  const validScore =
    input.score !== null && Number.isInteger(input.score) && input.score >= 0 && input.score <= 100;
  let qualityState: string;
  if (
    !validIssues ||
    !validRepair ||
    (input.verdict === null && input.score !== null) ||
    (input.verdict !== null &&
      (!validScore || !['PASS', 'REVISE', 'REJECT'].includes(input.verdict)))
  )
    qualityState = 'INVALID';
  else if (input.updatedAt >= input.cutoff) qualityState = 'AFTER_CUTOFF';
  else if (input.status === 'PROCESSING') qualityState = 'PENDING';
  else if (input.verdict === null) qualityState = 'UNCHECKED';
  else if (input.verdict === 'PASS')
    qualityState = input.repairCount > 0 ? 'REPAIRED_PASS' : 'PASS';
  else qualityState = input.verdict === 'REVISE' ? 'FINAL_REVISE' : 'FINAL_REJECT';
  return {
    attribution,
    qualityState,
    unconfirmedFact,
    hadIssues: input.issueCodes.length > 0,
    ...(validIssues
      ? {
          unknownIssueCount: input.issueCodes.filter(
            (code) => code !== 'PHOTO_FIRST_UNCONFIRMED_FACT',
          ).length,
        }
      : {}),
    ...(validRepair ? { repairCount: input.repairCount } : {}),
    recordedPromptVersion:
      input.promptVersion === 'mission-content-variant-v1'
        ? 'VARIANT_V1'
        : input.promptVersion === 'mission-content-generator-v18-photo-first-unconfirmed-facts'
          ? 'CONTENT_V18'
          : input.promptVersion === 'mission-quality-checker-v13-photo-first-grounding'
            ? 'QUALITY_V13'
            : input.promptVersion === 'photo-first-analysis-v3-confirmation-answer'
              ? 'PHOTO_ANALYSIS_V3'
              : 'UNAVAILABLE',
  };
}

/** Input must be a collection validated by CollectImprovementObservations. Rates describe inspected rows only. */
export function summarizeHassyPhotoQuality(
  input: ImprovementReadRequest,
  collection: ImprovementObservationCollection,
) {
  const attributionUnresolved = collection.observations.filter(
    (row) => row.metadata['attribution'] === 'UNATTRIBUTED',
  ).length;
  const groups = ['PHOTO_METADATA', 'PHOTO_ISSUE_SIGNAL', 'UNATTRIBUTED'].map((attribution) => {
    const rows = collection.observations.filter(
      (row) => row.metadata['attribution'] === attribution,
    );
    const count = (state: string) =>
      rows.filter((row) => row.metadata['qualityState'] === state).length;
    const pass = count('PASS');
    const repairedPass = count('REPAIRED_PASS');
    const finalRevise = count('FINAL_REVISE');
    const finalReject = count('FINAL_REJECT');
    const checked = pass + repairedPass + finalRevise + finalReject;
    const missing = rows.length - checked;
    const metric: ImprovementMetricSnapshot = {
      scope: input.scope,
      metricKey: `observed-quality-pass:${attribution}`,
      definitionVersion: HASSY_PHOTO_QUALITY_DEFINITION.version,
      fromInclusive: input.fromInclusive,
      toExclusive: input.toExclusive,
      numerator: pass + repairedPass,
      denominator: checked,
      distinctSubjects: new Set(rows.map((row) => row.userRef)).size,
      coverage: {
        ...collection.coverage,
        completeness:
          missing && collection.coverage.completeness === 'COMPLETE'
            ? 'PARTIAL'
            : collection.coverage.completeness,
        missingCount:
          collection.coverage.missingCount === null
            ? null
            : collection.coverage.missingCount + missing,
      },
      cost: { estimatedUsdMicros: null, confirmedUsdMicros: null, unresolvedCount: null },
    };
    return {
      attribution,
      observed: rows.length,
      generationFailed: rows.filter((row) => row.status === 'FAILED').length,
      checked,
      pass,
      repairedPass,
      finalRevise,
      finalReject,
      unchecked: count('UNCHECKED'),
      pending: count('PENDING'),
      invalid: count('INVALID'),
      afterCutoff: count('AFTER_CUTOFF'),
      issueObserved: rows.filter(
        (row) =>
          row.metadata['hadIssues'] &&
          ['PASS', 'REPAIRED_PASS', 'FINAL_REVISE', 'FINAL_REJECT'].includes(
            row.metadata['qualityState'] as string,
          ),
      ).length,
      unconfirmedFactObserved: rows.filter(
        (row) =>
          row.metadata['unconfirmedFact'] &&
          ['PASS', 'REPAIRED_PASS', 'FINAL_REVISE', 'FINAL_REJECT'].includes(
            row.metadata['qualityState'] as string,
          ),
      ).length,
      recordedVersionCounts: [
        'VARIANT_V1',
        'CONTENT_V18',
        'QUALITY_V13',
        'PHOTO_ANALYSIS_V3',
        'UNAVAILABLE',
      ].map((version) => ({
        version,
        count: rows.filter((row) => row.metadata['recordedPromptVersion'] === version).length,
      })),
      metric,
      observedCheckedPassRate: improvementMetricRate(metric),
    };
  });
  return {
    coverage: collection.coverage,
    attributionUnresolved,
    photoFirstPopulationPassRate: null,
    // Failures before a persisted generation, and loss/deletion of provenance, are not observable here.
    photoFirstPopulationCoverage: 'UNKNOWN' as const,
    groups,
  };
}
