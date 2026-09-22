import { ApplicationError } from '@bunshin/shared';

export interface RecordAiUsageInput {
  workspaceId: string;
  bunshinId: string | null;
  actorUserId: string;
  taskType: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCostUsdMicros?: number | null;
  pricingVersion?: string | null;
  errorCode?: string | null;
  idempotencyKey: string;
  occurredAt?: Date;
}

export interface AiUsageEventRepository {
  record(input: RecordAiUsageInput): Promise<void>;
}

export class RecordAiUsage {
  constructor(private readonly repository: AiUsageEventRepository) {}

  async execute(input: RecordAiUsageInput) {
    const required = [
      input.taskType,
      input.provider,
      input.model,
      input.promptVersion,
      input.idempotencyKey,
    ];
    if (required.some((value) => value.trim().length === 0))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI usage event');
    if (
      input.latencyMs < 0 ||
      (input.inputTokens !== null && input.inputTokens < 0) ||
      (input.outputTokens !== null && input.outputTokens < 0) ||
      (input.estimatedCostUsdMicros !== undefined &&
        input.estimatedCostUsdMicros !== null &&
        input.estimatedCostUsdMicros < 0)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI usage measurements');
    if (input.status === 'SUCCESS' && input.errorCode)
      throw new ApplicationError('VALIDATION_ERROR', 'successful AI usage cannot have errorCode');
    await this.repository.record(input);
  }
}

export type OrganizationAiReservationResult =
  | { status: 'RESERVED'; reservationId: string }
  | { status: 'ALREADY_RESERVED'; reservationId: string }
  | { status: 'UNLIMITED'; reservationId: null }
  | { status: 'EXHAUSTED'; reservationId: null };

export interface OrganizationAiGenerationReservationRepository {
  reserve(input: {
    workspaceId: string;
    operationKey: string;
    now: Date;
    expiresAt: Date;
  }): Promise<OrganizationAiReservationResult>;
  finish(input: {
    workspaceId: string;
    operationKey: string;
    outcome: 'CONSUMED' | 'RELEASED';
    now: Date;
  }): Promise<boolean>;
}

export class ReserveOrganizationAiGeneration {
  constructor(private readonly repository: OrganizationAiGenerationReservationRepository) {}

  async execute(input: {
    workspaceId: string;
    operationKey: string;
    now?: Date;
    reservationTtlMs?: number;
  }) {
    if (!input.operationKey.trim() || input.operationKey.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI generation operation key');
    const now = input.now ?? new Date();
    const ttl = input.reservationTtlMs ?? 15 * 60 * 1_000;
    if (!Number.isInteger(ttl) || ttl < 60_000 || ttl > 60 * 60 * 1_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI reservation TTL');
    return this.repository.reserve({
      workspaceId: input.workspaceId,
      operationKey: input.operationKey,
      now,
      expiresAt: new Date(now.getTime() + ttl),
    });
  }
}

export class FinishOrganizationAiGeneration {
  constructor(private readonly repository: OrganizationAiGenerationReservationRepository) {}

  execute(input: {
    workspaceId: string;
    operationKey: string;
    outcome: 'CONSUMED' | 'RELEASED';
    now?: Date;
  }) {
    return this.repository.finish({ ...input, now: input.now ?? new Date() });
  }
}
