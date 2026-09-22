import { ApplicationError } from '@bunshin/shared';

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  status: 'REQUESTED' | 'PROCESSING' | 'BLOCKED' | 'CANCELLED' | 'COMPLETED';
  requestedAt: Date;
  scheduledFor: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  processingStartedAt: Date | null;
  blockedReason: string | null;
  lastErrorCategory: string | null;
  executionVersion: number;
  summary: unknown;
}
export interface AccountDeletionRequestRepository {
  findCurrent(userId: string): Promise<AccountDeletionRequest | null>;
  request(userId: string, scheduledFor: Date): Promise<AccountDeletionRequest | null>;
  cancel(userId: string): Promise<AccountDeletionRequest | null>;
  listForAdmin(actorUserId: string): Promise<AccountDeletionRequest[] | null>;
}
export class GetAccountDeletionRequest {
  constructor(private readonly repository: AccountDeletionRequestRepository) {}
  execute(userId: string) {
    return this.repository.findCurrent(userId);
  }
}
export class RequestAccountDeletion {
  constructor(
    private readonly repository: AccountDeletionRequestRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(userId: string) {
    const scheduledFor = new Date(this.now().getTime() + 14 * 24 * 60 * 60 * 1000);
    const value = await this.repository.request(userId, scheduledFor);
    if (!value) throw new ApplicationError('CONFLICT', 'account deletion already requested');
    return value;
  }
}
export class CancelAccountDeletion {
  constructor(private readonly repository: AccountDeletionRequestRepository) {}
  async execute(userId: string) {
    const value = await this.repository.cancel(userId);
    if (!value) throw new ApplicationError('NOT_FOUND', 'account deletion request not found');
    return value;
  }
}
export class ListAccountDeletionRequests {
  constructor(private readonly repository: AccountDeletionRequestRepository) {}
  async execute(actorUserId: string) {
    const values = await this.repository.listForAdmin(actorUserId);
    if (!values) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}
