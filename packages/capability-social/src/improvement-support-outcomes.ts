import type {
  ImprovementObservationCollection,
  ImprovementReadRequest,
} from '@bunshin/application';
import {
  improvementMetricRate,
  type ImprovementAdapterDefinition,
  type ImprovementMetricSnapshot,
} from '@bunshin/platform-domain';
import { SOCIAL_ACCOUNT_STRATEGY_GOALS } from './social-account-strategy';
import { SOCIAL_ACTIVITY_SUPPORT_GOAL_FALLBACK_REASONS } from './activity-barrier-support';

export const HASSY_SUPPORT_IMPROVEMENT_DEFINITION: ImprovementAdapterDefinition = {
  key: 'HASSY_SUPPORT_OUTCOMES',
  version: 'hassy-support-outcomes-v1',
  packageKey: 'SOCIAL',
  subtypes: ['BARRIER_SUPPORT'],
  metadataRules: {
    goalBucket: {
      kind: 'CODE',
      values: [
        ...SOCIAL_ACCOUNT_STRATEGY_GOALS,
        'COMMON',
        'MIXED',
        'UNATTRIBUTED',
        'LEGACY',
        'INVALID',
      ],
    },
    eligibleGoal: { kind: 'CODE', values: [...SOCIAL_ACCOUNT_STRATEGY_GOALS, 'UNAVAILABLE'] },
    fallbackReason: {
      kind: 'CODE',
      values: [...SOCIAL_ACTIVITY_SUPPORT_GOAL_FALLBACK_REASONS, 'NONE', 'LEGACY', 'INVALID'],
    },
    acceptedByCutoff: { kind: 'BOOLEAN' },
    completedByCutoff: { kind: 'BOOLEAN' },
    skippedByCutoff: { kind: 'BOOLEAN' },
    timestampMissing: { kind: 'BOOLEAN' },
  },
};

/** Only the offered-time snapshot is authoritative; never consult the current profile. */
export function supportGoalAtOffer(snapshot: unknown): {
  goalBucket: string;
  eligibleGoal: string;
  fallbackReason: string;
} {
  const record = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const root = record(snapshot);
  if (!root || !Object.hasOwn(root, 'selection'))
    return { goalBucket: 'LEGACY', eligibleGoal: 'UNAVAILABLE', fallbackReason: 'LEGACY' };
  const selection = record(root['selection']);
  const invalid = { goalBucket: 'INVALID', eligibleGoal: 'UNAVAILABLE', fallbackReason: 'INVALID' };
  if (!selection) return invalid;
  const goal = selection['eligibleGoal'];
  const known =
    typeof goal === 'string' && (SOCIAL_ACCOUNT_STRATEGY_GOALS as readonly string[]).includes(goal);
  if (selection['mode'] === 'GOAL_SPECIFIC' && known && selection['fallbackReason'] === null)
    return { goalBucket: goal, eligibleGoal: goal, fallbackReason: 'NONE' };
  const reason = selection['fallbackReason'];
  if (
    selection['mode'] !== 'COMMON' ||
    (goal !== null && !known) ||
    typeof reason !== 'string' ||
    !(SOCIAL_ACTIVITY_SUPPORT_GOAL_FALLBACK_REASONS as readonly string[]).includes(reason)
  )
    return invalid;
  return {
    goalBucket:
      reason === 'MIXED_GOALS'
        ? 'MIXED'
        : [
              'ATTRIBUTION_UNAVAILABLE',
              'UNATTRIBUTED_MISSIONS',
              'NO_SINGLE_GOAL',
              'NO_OBSERVED_MISSIONS',
            ].includes(reason)
          ? 'UNATTRIBUTED'
          : 'COMMON',
    eligibleGoal: known ? goal : 'UNAVAILABLE',
    fallbackReason: reason,
  };
}

/** Offered-period cohort. End is also the exclusive outcome cutoff, not historical state replay. */
export function summarizeHassySupportOutcomes(
  input: ImprovementReadRequest,
  collection: ImprovementObservationCollection,
) {
  const buckets = new Map<string, typeof collection.observations>();
  for (const row of collection.observations) {
    const bucket = row.metadata['goalBucket'] as string;
    const rows = buckets.get(bucket) ?? [];
    rows.push(row);
    buckets.set(bucket, rows);
  }
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([goalBucket, rows]) => {
      const completed = rows.filter((row) => row.metadata['completedByCutoff'] === true).length;
      const missing = rows.filter((row) => row.metadata['timestampMissing'] === true).length;
      const metric: ImprovementMetricSnapshot = {
        scope: input.scope,
        metricKey: `support-completion:${goalBucket}`,
        definitionVersion: HASSY_SUPPORT_IMPROVEMENT_DEFINITION.version,
        fromInclusive: input.fromInclusive,
        toExclusive: input.toExclusive,
        numerator: completed,
        denominator: rows.length,
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
        goalBucket,
        offered: rows.length,
        accepted: rows.filter((row) => row.metadata['acceptedByCutoff'] === true).length,
        completed,
        skipped: rows.filter((row) => row.metadata['skippedByCutoff'] === true).length,
        timestampMissing: missing,
        metric,
        completionRate: improvementMetricRate(metric),
      };
    });
}
