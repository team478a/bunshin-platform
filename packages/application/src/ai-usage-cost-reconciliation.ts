import { ApplicationError } from '@bunshin/shared';
import type { AiProviderKey } from './ai-provider-configuration';
import type { LineConfigurationEnvironment } from './configuration-environment';

export const AI_USAGE_COST_RECONCILIATION_VERSION = 'AI_USAGE_COST_RECONCILIATION_V1';

export interface UnknownAiUsageCostObservation {
  id: string;
  provider: string;
  taskType: string;
  model: string;
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
  occurredAt: Date;
}

export interface AiUsageCostRepairUpdate {
  usageEventId: string;
  estimatedCostUsdMicros: number;
  pricingVersion: string;
}

export interface AiUsageCostReconciliationRepository {
  listUnknownCosts(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    monthlyFrom: Date;
    now: Date;
    limit: number;
  }): Promise<UnknownAiUsageCostObservation[] | null>;
  repairUnknownCosts(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    monthlyFrom: Date;
    now: Date;
    reason: string;
    evidenceReference: string;
    updates: readonly AiUsageCostRepairUpdate[];
  }): Promise<{
    scanned: number;
    updated: number;
    alreadyReconciled: number;
  } | null>;
}

const symbol = (value: unknown, max = 200) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const uuid = (value: unknown) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function monthBounds(now: Date) {
  if (Number.isNaN(now.getTime())) throw new ApplicationError('VALIDATION_ERROR', 'invalid time');
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function validateCommon(input: {
  actorUserId: string;
  environment: LineConfigurationEnvironment;
  provider: AiProviderKey;
  now: Date;
}) {
  if (
    !symbol(input.actorUserId) ||
    !['DEVELOPMENT', 'STAGING', 'PRODUCTION'].includes(input.environment)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation scope');
  if (
    !['OPENAI', 'GOOGLE', 'GROK', 'EXA', 'FIRECRAWL', 'CREATOMATE', 'FAL', 'RUNWAY'].includes(
      input.provider,
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation provider');
  return monthBounds(input.now);
}

export class ListUnknownAiUsageCosts {
  constructor(private readonly repository: AiUsageCostReconciliationRepository) {}

  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    now?: Date;
    limit?: number;
  }) {
    const now = input.now ?? new Date();
    const monthlyFrom = validateCommon({ ...input, now });
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation limit');
    const rows = await this.repository.listUnknownCosts({
      ...input,
      now,
      monthlyFrom,
      limit,
    });
    if (rows === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return { version: AI_USAGE_COST_RECONCILIATION_VERSION, monthlyFrom, now, rows };
  }
}

export class RepairUnknownAiUsageCosts {
  constructor(private readonly repository: AiUsageCostReconciliationRepository) {}

  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    provider: AiProviderKey;
    reason: string;
    evidenceReference: string;
    updates: readonly AiUsageCostRepairUpdate[];
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const monthlyFrom = validateCommon({ ...input, now });
    const reason = input.reason.trim();
    const evidenceReference = input.evidenceReference.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation reason');
    if (!symbol(evidenceReference, 200))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation evidence reference');
    if (input.updates.length < 1 || input.updates.length > 100)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation updates');
    const ids = new Set<string>();
    for (const update of input.updates) {
      if (!uuid(update.usageEventId) || ids.has(update.usageEventId))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid or duplicate usage event id');
      ids.add(update.usageEventId);
      if (
        !Number.isSafeInteger(update.estimatedCostUsdMicros) ||
        update.estimatedCostUsdMicros <= 0
      )
        throw new ApplicationError('VALIDATION_ERROR', 'reconciliation cost must be positive');
      if (!symbol(update.pricingVersion, 120))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid reconciliation pricing version');
    }
    const result = await this.repository.repairUnknownCosts({
      ...input,
      now,
      monthlyFrom,
      reason,
      evidenceReference,
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return { version: AI_USAGE_COST_RECONCILIATION_VERSION, monthlyFrom, now, ...result };
  }
}
