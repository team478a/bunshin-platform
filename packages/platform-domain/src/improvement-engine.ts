export const IMPROVEMENT_ISSUE_CATEGORIES = [
  'BUG',
  'UX',
  'USER_ERROR',
  'AI_QUALITY',
  'PERFORMANCE',
  'DATA_ANALYTICS',
  'INTEGRATION',
  'SECURITY_PRIVACY',
  'SERVICE_SPECIFIC',
  'UNKNOWN',
] as const;
export type ImprovementIssueCategory = (typeof IMPROVEMENT_ISSUE_CATEGORIES)[number];
export type ImprovementPurpose = 'PRODUCT_IMPROVEMENT' | 'USER_SUCCESS' | 'BUSINESS_IMPROVEMENT';
export type ImprovementIssueStatus =
  | 'DETECTED'
  | 'TRIAGED'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_DEVELOPMENT'
  | 'FIXED'
  | 'VERIFYING'
  | 'CLOSED'
  | 'REOPENED';

/** Trusted authorization and adapter configuration must resolve this scope. */
export interface ImprovementScope {
  tenantRef: string;
  workspaceId: string;
  serviceId: string;
  packageKey: string;
  adapterKey: string;
  environment: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
}
export interface ImprovementObservation {
  scope: ImprovementScope;
  source: { kind: string; id: string; revision: string | null };
  occurredAt: Date;
  feature: string;
  action: string;
  eventType: string;
  status: string;
  category: ImprovementIssueCategory;
  purpose: ImprovementPurpose;
  subtype: string;
  errorCode: string | null;
  correlation: { kind: 'EXPLICIT_REFERENCE' | 'JOB' | 'UNAVAILABLE'; key: string | null };
  releaseSha: string | null;
  userRef: string | null;
  bunshinRef: string | null;
  entityRef: string | null;
  metadata: Readonly<Record<string, unknown>>;
}
export type ImprovementMetadataRule =
  | { kind: 'CODE'; values: readonly string[] }
  | { kind: 'COUNT'; max: number }
  | { kind: 'BOOLEAN' };
export interface ImprovementAdapterDefinition {
  key: string;
  version: string;
  packageKey: string;
  subtypes: readonly string[];
  metadataRules: Readonly<Record<string, ImprovementMetadataRule>>;
}
export type ImprovementSafeObservation = Omit<ImprovementObservation, 'metadata'> & {
  eventId: string;
  metadata: Record<string, string | number | boolean>;
};
export type ImprovementCompleteness = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
export interface ImprovementCoverage {
  completeness: ImprovementCompleteness;
  missingCount: number | null;
  truncated: boolean;
}

export interface ImprovementMetricSnapshot {
  scope: ImprovementScope;
  metricKey: string;
  definitionVersion: string;
  fromInclusive: Date;
  toExclusive: Date;
  numerator: number;
  denominator: number | null;
  distinctSubjects: number | null;
  coverage: ImprovementCoverage;
  cost: {
    estimatedUsdMicros: number | null;
    confirmedUsdMicros: number | null;
    unresolvedCount: number | null;
  };
}

/** Counts are observations, not causal effects. Missing costs remain null. */
export function validateImprovementMetricSnapshot(metric: ImprovementMetricSnapshot): void {
  validateImprovementScope(metric.scope);
  validateImprovementCoverage(metric.coverage);
  if (
    !validReference(metric.metricKey) ||
    !validReference(metric.definitionVersion) ||
    !(metric.fromInclusive instanceof Date) ||
    !(metric.toExclusive instanceof Date) ||
    !Number.isFinite(metric.fromInclusive.getTime()) ||
    !Number.isFinite(metric.toExclusive.getTime()) ||
    metric.fromInclusive >= metric.toExclusive
  )
    throw new Error('invalid improvement metric period');
  for (const value of [
    metric.numerator,
    metric.denominator,
    metric.distinctSubjects,
    metric.cost.estimatedUsdMicros,
    metric.cost.confirmedUsdMicros,
    metric.cost.unresolvedCount,
  ])
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new Error('invalid improvement metric count');
  if (
    !Number.isSafeInteger(metric.numerator) ||
    metric.numerator < 0 ||
    (metric.denominator !== null && metric.numerator > metric.denominator)
  )
    throw new Error('invalid improvement numerator');
}

export function improvementMetricRate(metric: ImprovementMetricSnapshot): number | null {
  validateImprovementMetricSnapshot(metric);
  return metric.coverage.completeness === 'COMPLETE' &&
    metric.denominator !== null &&
    metric.denominator > 0
    ? metric.numerator / metric.denominator
    : null;
}

export function sameImprovementScope(left: ImprovementScope, right: ImprovementScope): boolean {
  return (
    left.tenantRef === right.tenantRef &&
    left.workspaceId === right.workspaceId &&
    left.serviceId === right.serviceId &&
    left.packageKey === right.packageKey &&
    left.adapterKey === right.adapterKey &&
    left.environment === right.environment
  );
}

export function validateImprovementScope(scope: ImprovementScope): void {
  for (const value of [
    scope.tenantRef,
    scope.workspaceId,
    scope.serviceId,
    scope.packageKey,
    scope.adapterKey,
  ])
    if (!validReference(value)) throw new Error('invalid improvement scope');
  if (!['PRODUCTION', 'STAGING', 'DEVELOPMENT'].includes(scope.environment))
    throw new Error('invalid improvement environment');
}

function validReference(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 240 &&
    !/\s/u.test(value) &&
    [...value].every((character) => character.charCodeAt(0) >= 32)
  );
}

/** Drops unknown metadata and returns a detached allowlisted record. No raw text is accepted. */
export function sanitizeImprovementObservation(
  observation: ImprovementObservation,
  definition: ImprovementAdapterDefinition,
): ImprovementSafeObservation {
  validateImprovementScope(observation.scope);
  if (
    observation.scope.adapterKey !== definition.key ||
    observation.scope.packageKey !== definition.packageKey
  )
    throw new Error('improvement adapter mismatch');
  if (!definition.subtypes.includes(observation.subtype))
    throw new Error('unknown improvement subtype');
  if (
    !IMPROVEMENT_ISSUE_CATEGORIES.includes(observation.category) ||
    !['PRODUCT_IMPROVEMENT', 'USER_SUCCESS', 'BUSINESS_IMPROVEMENT'].includes(observation.purpose)
  )
    throw new Error('invalid improvement classification');
  for (const value of [
    observation.source.kind,
    observation.source.id,
    observation.feature,
    observation.action,
    observation.eventType,
    observation.status,
    observation.subtype,
  ])
    if (!validReference(value)) throw new Error('invalid improvement observation');
  for (const value of [
    observation.source.revision,
    observation.errorCode,
    observation.userRef,
    observation.bunshinRef,
    observation.entityRef,
    observation.correlation.key,
  ])
    if (value !== null && !validReference(value)) throw new Error('invalid improvement reference');
  if (
    !(observation.occurredAt instanceof Date) ||
    !Number.isFinite(observation.occurredAt.getTime())
  )
    throw new Error('invalid improvement timestamp');
  if (
    !['EXPLICIT_REFERENCE', 'JOB', 'UNAVAILABLE'].includes(observation.correlation.kind) ||
    (observation.correlation.kind === 'UNAVAILABLE') !== (observation.correlation.key === null)
  )
    throw new Error('invalid improvement correlation');
  if (observation.releaseSha !== null && !/^[a-f0-9]{40}$/u.test(observation.releaseSha))
    throw new Error('invalid improvement release');
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, rule] of Object.entries(definition.metadataRules)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('invalid metadata rule');
    if (!Object.hasOwn(observation.metadata, key)) continue;
    const value = observation.metadata[key];
    if (rule.kind === 'CODE' && typeof value === 'string' && rule.values.includes(value))
      metadata[key] = value;
    else if (rule.kind === 'BOOLEAN' && typeof value === 'boolean') metadata[key] = value;
    else if (
      rule.kind === 'COUNT' &&
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= rule.max
    )
      metadata[key] = value;
    else throw new Error('invalid improvement metadata');
  }
  // Explicit projection prevents runtime extra fields from crossing the privacy boundary.
  return {
    scope: {
      tenantRef: observation.scope.tenantRef,
      workspaceId: observation.scope.workspaceId,
      serviceId: observation.scope.serviceId,
      packageKey: observation.scope.packageKey,
      adapterKey: observation.scope.adapterKey,
      environment: observation.scope.environment,
    },
    source: {
      kind: observation.source.kind,
      id: observation.source.id,
      revision: observation.source.revision,
    },
    eventId: JSON.stringify([observation.source.kind, observation.source.id]),
    occurredAt: new Date(observation.occurredAt),
    feature: observation.feature,
    action: observation.action,
    eventType: observation.eventType,
    status: observation.status,
    category: observation.category,
    purpose: observation.purpose,
    subtype: observation.subtype,
    errorCode: observation.errorCode,
    correlation: { kind: observation.correlation.kind, key: observation.correlation.key },
    releaseSha: observation.releaseSha,
    userRef: observation.userRef,
    bunshinRef: observation.bunshinRef,
    entityRef: observation.entityRef,
    metadata,
  };
}

export function validateImprovementCoverage(coverage: ImprovementCoverage): void {
  if (
    !['COMPLETE', 'PARTIAL', 'UNKNOWN'].includes(coverage.completeness) ||
    typeof coverage.truncated !== 'boolean' ||
    (coverage.missingCount !== null &&
      (!Number.isSafeInteger(coverage.missingCount) || coverage.missingCount < 0))
  )
    throw new Error('invalid improvement coverage');
  if (coverage.completeness === 'COMPLETE' && (coverage.truncated || coverage.missingCount !== 0))
    throw new Error('incomplete improvement coverage');
}

const transitions: Record<ImprovementIssueStatus, readonly ImprovementIssueStatus[]> = {
  DETECTED: ['TRIAGED'],
  TRIAGED: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_DEVELOPMENT'],
  REJECTED: [],
  IN_DEVELOPMENT: ['FIXED'],
  FIXED: ['VERIFYING'],
  VERIFYING: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['TRIAGED'],
};
/** Domain legality only; application authorization and persistence are separate requirements. */
export function canTransitionImprovementIssue(
  from: ImprovementIssueStatus,
  to: ImprovementIssueStatus,
): boolean {
  return transitions[from]?.includes(to) ?? false;
}
export interface ImprovementApproval {
  scope: ImprovementScope;
  actorUserId: string;
  candidateRevision: string;
  evidenceRevision: string;
}
/** Eligibility only. This does not generate instructions, start Codex, or modify code. */
export function isImprovementInstructionEligible(input: {
  scope: ImprovementScope;
  status: ImprovementIssueStatus;
  candidateRevision: string;
  evidenceRevision: string;
  approval: ImprovementApproval | null;
}): boolean {
  return (
    input.status === 'APPROVED' &&
    input.approval !== null &&
    validReference(input.approval.actorUserId) &&
    validReference(input.candidateRevision) &&
    validReference(input.evidenceRevision) &&
    sameImprovementScope(input.scope, input.approval.scope) &&
    input.candidateRevision === input.approval.candidateRevision &&
    input.evidenceRevision === input.approval.evidenceRevision
  );
}
