import { ApplicationError } from '@bunshin/shared';

export type AccountDeletionBlockedReason =
  | 'SOLE_ORGANIZATION_OWNER'
  | 'ACTIVE_PLATFORM_ADMIN'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'AUTH_CONFIGURATION_UNAVAILABLE'
  | 'AUTH_ENVIRONMENT_MISMATCH';

export interface AccountDeletionPreparation {
  requestId: string;
  userId: string;
  status: 'PROCESSING' | 'BLOCKED';
  attemptCount: number;
  blockedReason: AccountDeletionBlockedReason | null;
  leaseExpiresAt: Date | null;
}

export interface AccountDeletionExecutionRepository {
  claimAndSuspendNext(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    executionVersion: number;
  }): Promise<AccountDeletionPreparation | null>;
}

export type AuthAdministrationFailureCategory =
  | 'AUTH_CONFIGURATION_UNAVAILABLE'
  | 'AUTH_ENVIRONMENT_MISMATCH'
  | 'AUTH_CREDENTIAL_INVALID'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_PROVIDER_UNAVAILABLE';

export type AuthAdministrationResult =
  | { success: true; alreadyAbsent: boolean }
  | {
      success: false;
      category: AuthAdministrationFailureCategory;
      retryable: boolean;
    };

export interface AuthAdministrationPort {
  deleteUser(providerUserId: string): Promise<AuthAdministrationResult>;
}

export interface AccountDeletionOrchestrationRepository {
  findEmailIdentity(input: {
    requestId: string;
    userId: string;
    workerId: string;
    now: Date;
  }): Promise<{ providerUserId: string } | null>;
  recordAuthFailure(input: {
    requestId: string;
    userId: string;
    workerId: string;
    now: Date;
    category: AuthAdministrationFailureCategory;
    retryable: boolean;
  }): Promise<boolean>;
  inspect(now: Date): Promise<{ due: number; processing: number; blocked: number }>;
}

export interface AccountDeletionBatchSummary {
  mode: 'dry-run' | 'enabled';
  inspected: number;
  completed: number;
  blocked: number;
  retryScheduled: number;
  infrastructureFailures: number;
}

export class RunAccountDeletionBatch {
  constructor(
    private readonly prepare: PrepareNextAccountDeletion,
    private readonly orchestration: AccountDeletionOrchestrationRepository,
    private readonly auth: AuthAdministrationPort,
    private readonly purge: CompleteAccountDeletionPurge,
    private readonly now = () => new Date(),
  ) {}

  async dryRun(): Promise<AccountDeletionBatchSummary> {
    const values = await this.orchestration.inspect(this.now());
    return {
      mode: 'dry-run',
      inspected: values.due + values.processing + values.blocked,
      completed: 0,
      blocked: values.blocked,
      retryScheduled: values.processing,
      infrastructureFailures: 0,
    };
  }

  async execute(workerId: string, batchSize = 3): Promise<AccountDeletionBatchSummary> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid account deletion batch size');
    const summary: AccountDeletionBatchSummary = {
      mode: 'enabled',
      inspected: 0,
      completed: 0,
      blocked: 0,
      retryScheduled: 0,
      infrastructureFailures: 0,
    };
    for (let index = 0; index < batchSize; index += 1) {
      const prepared = await this.prepare.execute(workerId);
      if (!prepared) break;
      summary.inspected += 1;
      if (prepared.status === 'BLOCKED') {
        summary.blocked += 1;
        continue;
      }
      const identity = await this.orchestration.findEmailIdentity({
        requestId: prepared.requestId,
        userId: prepared.userId,
        workerId,
        now: this.now(),
      });
      const authResult = identity
        ? await this.auth.deleteUser(identity.providerUserId)
        : ({ success: true, alreadyAbsent: true } as const);
      if (!authResult.success) {
        const recorded = await this.orchestration.recordAuthFailure({
          requestId: prepared.requestId,
          userId: prepared.userId,
          workerId,
          now: this.now(),
          category: authResult.category,
          retryable: authResult.retryable,
        });
        if (!recorded) summary.infrastructureFailures += 1;
        else if (authResult.retryable) summary.retryScheduled += 1;
        else summary.blocked += 1;
        continue;
      }
      const result = await this.purge.execute({
        requestId: prepared.requestId,
        userId: prepared.userId,
        workerId,
      });
      if (result?.status === 'COMPLETED') summary.completed += 1;
      else if (result?.status === 'BLOCKED') summary.blocked += 1;
      else summary.infrastructureFailures += 1;
    }
    return summary;
  }
}

export interface AccountDeletionAdminOperationsRepository {
  retryBlocked(input: {
    requestId: string;
    actorUserId: string;
    reason: string;
    now: Date;
  }): Promise<boolean | null>;
}

export class RetryBlockedAccountDeletion {
  constructor(
    private readonly repository: AccountDeletionAdminOperationsRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: { requestId: string; actorUserId: string; reason: string }) {
    const reason = input.reason.trim();
    if (!input.requestId || !input.actorUserId || reason.length < 10 || reason.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid account deletion retry request');
    const result = await this.repository.retryBlocked({ ...input, reason, now: this.now() });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'platform admin required');
    if (!result) throw new ApplicationError('CONFLICT', 'account deletion cannot be retried');
  }
}

export interface AccountDeletionPurgeResult {
  requestId: string;
  userId: string;
  status: 'COMPLETED' | 'BLOCKED';
  blockedReason: AccountDeletionBlockedReason | null;
}

export interface AccountDeletionPurgeRepository {
  completeAfterAuthDeletion(input: {
    requestId: string;
    userId: string;
    workerId: string;
    now: Date;
  }): Promise<AccountDeletionPurgeResult | null>;
}

export class CompleteAccountDeletionPurge {
  constructor(
    private readonly repository: AccountDeletionPurgeRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(input: { requestId: string; userId: string; workerId: string }) {
    if (!input.requestId || !input.userId || !input.workerId.trim() || input.workerId.length > 120)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid account deletion purge input');
    return this.repository.completeAfterAuthDeletion({ ...input, now: this.now() });
  }
}

export class PrepareNextAccountDeletion {
  constructor(
    private readonly repository: AccountDeletionExecutionRepository,
    private readonly now = () => new Date(),
    private readonly leaseMilliseconds = 5 * 60 * 1_000,
    private readonly executionVersion = 1,
  ) {}

  async execute(workerId: string): Promise<AccountDeletionPreparation | null> {
    if (!workerId.trim() || workerId.length > 120)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid account deletion worker');
    if (this.leaseMilliseconds < 30_000 || this.leaseMilliseconds > 15 * 60 * 1_000)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid account deletion lease');
    if (!Number.isInteger(this.executionVersion) || this.executionVersion < 1)
      throw new ApplicationError('CONFIGURATION_ERROR', 'invalid deletion execution version');
    const now = this.now();
    return this.repository.claimAndSuspendNext({
      workerId,
      now,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMilliseconds),
      executionVersion: this.executionVersion,
    });
  }
}
