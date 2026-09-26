import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './configuration-environment';

export type ServiceLineBroadcastRecipientStatus =
  'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'CANCELLED';

export interface ServiceLineBroadcastSummary {
  id: string;
  title: string;
  message: string;
  status: string;
  scheduledAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  segment: unknown;
  recipientCounts: Partial<Record<ServiceLineBroadcastRecipientStatus, number>>;
}

export interface ServiceLineBroadcastOperationsRepository {
  list(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    limit: number;
    includeIndustries: boolean;
  }): Promise<{
    broadcasts: ServiceLineBroadcastSummary[];
    industries: Array<{ id: string; name: string }>;
  } | null>;
  retry(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId: string;
    broadcastId: string;
    actorUserId: string;
    reason: string;
    scheduledAt: Date;
  }): Promise<
    | { kind: 'SCHEDULED'; broadcastId: string; recipientCount: number; scheduledAt: Date }
    | { kind: 'ACCESS_DENIED' | 'CANNOT_RETRY' | 'NO_FAILED_RECIPIENTS' }
  >;
  cancel(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId: string;
    broadcastId: string;
    actorUserId: string;
    reason: string;
    cancelledAt: Date;
  }): Promise<
    | { kind: 'CANCELLED'; broadcastId: string; cancelledAt: Date }
    | { kind: 'ACCESS_DENIED' | 'CANNOT_CANCEL' }
  >;
}

const reason = (value: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  return normalized;
};

const cell = (value: string | number | null) => {
  const serialized = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(serialized) ? `'${serialized}` : serialized;
  return `"${safe.replaceAll('"', '""')}"`;
};

export class ServiceLineBroadcastOperationsService {
  constructor(
    private readonly repository: ServiceLineBroadcastOperationsRepository,
    private readonly now = () => new Date(),
  ) {}

  async list(input: { workspaceId: string; groupId: string; actorUserId: string }) {
    const result = await this.repository.list({ ...input, limit: 30, includeIndustries: true });
    if (!result) throw new ApplicationError('FORBIDDEN', 'service broadcast list denied');
    return result;
  }

  async exportCsv(input: { workspaceId: string; groupId: string; actorUserId: string }) {
    const result = await this.repository.list({ ...input, limit: 5_000, includeIndustries: false });
    if (!result) throw new ApplicationError('FORBIDDEN', 'service broadcast export denied');
    const rows: Array<Array<string | number | null>> = [
      [
        '件名',
        '状態',
        '予約日時',
        '作成日時',
        '完了日時',
        '送信成功',
        '送信失敗',
        '対象外',
        '取消',
      ],
      ...result.broadcasts.map((broadcast) => [
        broadcast.title,
        broadcast.status,
        broadcast.scheduledAt?.toISOString() ?? null,
        broadcast.createdAt.toISOString(),
        broadcast.completedAt?.toISOString() ?? null,
        broadcast.recipientCounts.SENT ?? 0,
        broadcast.recipientCounts.FAILED ?? 0,
        broadcast.recipientCounts.SKIPPED ?? 0,
        broadcast.recipientCounts.CANCELLED ?? 0,
      ]),
    ];
    return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`;
  }

  async retry(
    input: Omit<
      Parameters<ServiceLineBroadcastOperationsRepository['retry']>[0],
      'reason' | 'scheduledAt'
    > & { reason: string },
  ) {
    const result = await this.repository.retry({
      ...input,
      reason: reason(input.reason),
      scheduledAt: this.now(),
    });
    if (result.kind === 'SCHEDULED') return result;
    if (result.kind === 'ACCESS_DENIED')
      throw new ApplicationError('FORBIDDEN', 'service broadcast retry denied');
    if (result.kind === 'NO_FAILED_RECIPIENTS')
      throw new ApplicationError('CONFLICT', 'no failed recipients to retry');
    throw new ApplicationError('CONFLICT', 'broadcast cannot be retried');
  }

  async cancel(
    input: Omit<
      Parameters<ServiceLineBroadcastOperationsRepository['cancel']>[0],
      'reason' | 'cancelledAt'
    > & { reason: string },
  ) {
    const result = await this.repository.cancel({
      ...input,
      reason: reason(input.reason),
      cancelledAt: this.now(),
    });
    if (result.kind === 'CANCELLED') return result;
    if (result.kind === 'ACCESS_DENIED')
      throw new ApplicationError('FORBIDDEN', 'service broadcast cancellation denied');
    throw new ApplicationError('CONFLICT', 'broadcast cannot be cancelled');
  }
}
