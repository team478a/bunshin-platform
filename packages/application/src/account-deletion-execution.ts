import { ApplicationError } from '@bunshin/shared';

export type AccountDeletionBlockedReason =
  'SOLE_ORGANIZATION_OWNER' | 'ACTIVE_PLATFORM_ADMIN' | 'MANUAL_REVIEW_REQUIRED';

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
