import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export interface LineOperationalSnapshot {
  environment: LineConfigurationEnvironment;
  configuration: { active: boolean; verified: boolean; globallyPaused: boolean };
  deliveries: { failed: number };
  jobs: { retryScheduled: number; dead: number };
  failures: Array<{ category: string; count: number }>;
}

export interface LineOperationalSnapshotRepository {
  get(environment: LineConfigurationEnvironment): Promise<LineOperationalSnapshot>;
}

export type LineOperationalAlertSeverity = 'WARNING' | 'CRITICAL';

export interface LineOperationalAlert {
  code: string;
  severity: LineOperationalAlertSeverity;
  count: number | null;
}

export interface LineOperationalAssessment {
  environment: LineConfigurationEnvironment;
  ready: boolean;
  alerts: LineOperationalAlert[];
  fingerprint: string;
  checkedAt: Date;
}

const criticalFailureCategories = new Set([
  'CONFIGURATION_UNAVAILABLE',
  'ENVIRONMENT_MISMATCH',
  'CREDENTIAL_INVALID',
  'QUOTA_EXHAUSTED',
]);

function stableFingerprint(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function assessLineOperationalReadiness(
  snapshot: LineOperationalSnapshot,
  checkedAt = new Date(),
): LineOperationalAssessment {
  const alerts: LineOperationalAlert[] = [];
  if (!snapshot.configuration.active)
    alerts.push({ code: 'ACTIVE_CONFIGURATION_MISSING', severity: 'CRITICAL', count: null });
  else if (!snapshot.configuration.verified)
    alerts.push({ code: 'ACTIVE_CONFIGURATION_UNVERIFIED', severity: 'CRITICAL', count: null });
  if (snapshot.configuration.globallyPaused)
    alerts.push({ code: 'DELIVERY_GLOBALLY_PAUSED', severity: 'WARNING', count: null });
  if (snapshot.jobs.dead > 0)
    alerts.push({ code: 'DEAD_DELIVERY_JOBS', severity: 'CRITICAL', count: snapshot.jobs.dead });
  if (snapshot.jobs.retryScheduled > 0)
    alerts.push({
      code: 'RETRY_SCHEDULED_DELIVERY_JOBS',
      severity: 'WARNING',
      count: snapshot.jobs.retryScheduled,
    });
  for (const failure of snapshot.failures
    .filter(({ count }) => count > 0)
    .sort((left, right) => left.category.localeCompare(right.category))) {
    alerts.push({
      code: `DELIVERY_FAILURE_${failure.category}`,
      severity: criticalFailureCategories.has(failure.category) ? 'CRITICAL' : 'WARNING',
      count: failure.count,
    });
  }
  if (snapshot.deliveries.failed > 0 && snapshot.failures.length === 0)
    alerts.push({
      code: 'FAILED_DELIVERIES_UNCLASSIFIED',
      severity: 'WARNING',
      count: snapshot.deliveries.failed,
    });
  const canonical = alerts
    .map(({ code, severity, count }) => `${severity}:${code}:${count ?? '-'}`)
    .join('|');
  return {
    environment: snapshot.environment,
    ready: !alerts.some(({ severity }) => severity === 'CRITICAL'),
    alerts,
    fingerprint: stableFingerprint(`${snapshot.environment}|${canonical}`),
    checkedAt,
  };
}

export interface LineOperationalAlertPort {
  notify(assessment: LineOperationalAssessment): Promise<void>;
}

export class CheckLineOperationalReadiness {
  constructor(
    private readonly repository: LineOperationalSnapshotRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(environment: LineConfigurationEnvironment) {
    const snapshot = await this.repository.get(environment);
    if (snapshot.environment !== environment)
      throw new ApplicationError('INTERNAL_ERROR', 'LINE environment mismatch');
    return assessLineOperationalReadiness(snapshot, this.now());
  }
}

export class NotifyLineOperationalAlerts {
  constructor(
    private readonly check: CheckLineOperationalReadiness,
    private readonly notifier: LineOperationalAlertPort,
  ) {}

  async execute(environment: LineConfigurationEnvironment) {
    const assessment = await this.check.execute(environment);
    if (assessment.alerts.length > 0) await this.notifier.notify(assessment);
    return assessment;
  }
}
