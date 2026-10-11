import { ApplicationError } from '@bunshin/shared';
import type { AiProviderKey } from './ai-provider-configuration';
import type { LineConfigurationEnvironment } from './configuration-environment';

export const AI_PROVIDER_STALE_ADMISSION_MINUTES = 15;
export const AI_PROVIDER_STALE_ALERT_REPEAT_MINUTES = 60;
export const AI_PROVIDER_STALE_ALERT_BATCH_LIMIT = 1_000;

export interface StaleAiProviderAdmissionSummary {
  provider: AiProviderKey;
  openCount: number;
  reservedCostUsdMicros: number;
  oldestAdmittedAt: Date;
}

export interface StaleAiProviderAdmissionBatch {
  admissionIds: string[];
  summaries: StaleAiProviderAdmissionSummary[];
  truncated: boolean;
}

export interface StaleAiProviderAdmissionAssessment {
  environment: LineConfigurationEnvironment;
  summaries: StaleAiProviderAdmissionSummary[];
  fingerprint: string;
  checkedAt: Date;
  truncated: boolean;
}

export interface AiProviderStaleAdmissionAlertRepository {
  listStaleAdmissionsForAlert(input: {
    environment: LineConfigurationEnvironment;
    staleBefore: Date;
    repeatBefore: Date;
    limit: number;
  }): Promise<StaleAiProviderAdmissionBatch>;
  recordStaleAdmissionAlert(input: {
    environment: LineConfigurationEnvironment;
    admissionIds: string[];
    repeatBefore: Date;
    alertedAt: Date;
  }): Promise<number>;
}

export interface AiProviderStaleAdmissionAlertPort {
  notify(assessment: StaleAiProviderAdmissionAssessment): Promise<void>;
}

function fingerprint(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function safeDate(value: Date) {
  return Number.isFinite(value.getTime());
}

export class MonitorStaleAiProviderAdmissions {
  constructor(
    private readonly repository: AiProviderStaleAdmissionAlertRepository,
    private readonly notifier: AiProviderStaleAdmissionAlertPort | null,
    private readonly now = () => new Date(),
  ) {}

  async execute(environment: LineConfigurationEnvironment) {
    const checkedAt = this.now();
    const staleBefore = new Date(
      checkedAt.getTime() - AI_PROVIDER_STALE_ADMISSION_MINUTES * 60_000,
    );
    const repeatBefore = new Date(
      checkedAt.getTime() - AI_PROVIDER_STALE_ALERT_REPEAT_MINUTES * 60_000,
    );
    const batch = await this.repository.listStaleAdmissionsForAlert({
      environment,
      staleBefore,
      repeatBefore,
      limit: AI_PROVIDER_STALE_ALERT_BATCH_LIMIT,
    });
    const summarizedAdmissionCount = batch.summaries.reduce(
      (sum, { openCount }) => sum + openCount,
      0,
    );
    if (
      batch.admissionIds.length > AI_PROVIDER_STALE_ALERT_BATCH_LIMIT ||
      new Set(batch.admissionIds).size !== batch.admissionIds.length ||
      batch.summaries.some(
        (summary) =>
          !Number.isSafeInteger(summary.openCount) ||
          summary.openCount < 1 ||
          !Number.isSafeInteger(summary.reservedCostUsdMicros) ||
          summary.reservedCostUsdMicros < 0 ||
          !safeDate(summary.oldestAdmittedAt),
      ) ||
      summarizedAdmissionCount !== batch.admissionIds.length ||
      (batch.admissionIds.length === 0) !== (batch.summaries.length === 0)
    )
      throw new ApplicationError('INTERNAL_ERROR', 'invalid stale provider admission snapshot');
    const summaries = [...batch.summaries].sort((left, right) =>
      left.provider.localeCompare(right.provider),
    );
    const assessment: StaleAiProviderAdmissionAssessment = {
      environment,
      summaries,
      fingerprint: fingerprint(
        [
          environment,
          `HOUR:${Math.floor(checkedAt.getTime() / (60 * 60_000))}`,
          ...batch.admissionIds.slice().sort(),
          ...summaries.map(
            ({ provider, openCount, reservedCostUsdMicros, oldestAdmittedAt }) =>
              `${provider}:${openCount}:${reservedCostUsdMicros}:${oldestAdmittedAt.toISOString()}`,
          ),
          batch.truncated ? 'TRUNCATED' : 'COMPLETE',
        ].join('|'),
      ),
      checkedAt,
      truncated: batch.truncated,
    };
    if (batch.admissionIds.length === 0 || summaries.length === 0)
      return { assessment, notified: false, recorded: 0 };
    if (this.notifier === null) return { assessment, notified: false, recorded: 0 };
    await this.notifier.notify(assessment);
    const recorded = await this.repository.recordStaleAdmissionAlert({
      environment,
      admissionIds: batch.admissionIds,
      repeatBefore,
      alertedAt: checkedAt,
    });
    return { assessment, notified: true, recorded };
  }
}
