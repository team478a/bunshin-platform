import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './configuration-environment';

export type ServiceLineBroadcastRecipientStatus =
  'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'CANCELLED';

export type ServiceLineBroadcastOperationalStatus =
  'HEALTHY' | 'SCHEDULED' | 'STALLED' | 'NEEDS_ATTENTION' | 'RECOVERED' | 'CANCELLED';

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
  recoveryAttempts: number;
}

export interface ServiceLineBroadcastOperationalSummary extends ServiceLineBroadcastSummary {
  operationalStatus: ServiceLineBroadcastOperationalStatus;
  failureRate: number;
  totalRecipients: number;
}

export interface ServiceLineBroadcastHealthSummary {
  totalBroadcasts: number;
  stalledBroadcasts: number;
  broadcastsWithFailures: number;
  deliveredRecipients: number;
  failedRecipients: number;
  recoveryAttempts: number;
  failureRate: number;
}

export interface ServiceLineBroadcastOperationsRepository {
  list(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    environment: LineConfigurationEnvironment;
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

const STALLED_AFTER_MS = 15 * 60 * 1_000;

function withOperationalStatus(
  broadcast: ServiceLineBroadcastSummary,
  now: Date,
): ServiceLineBroadcastOperationalSummary {
  const sent = broadcast.recipientCounts.SENT ?? 0;
  const failed = broadcast.recipientCounts.FAILED ?? 0;
  const attempted = sent + failed;
  const pending = broadcast.recipientCounts.PENDING ?? 0;
  const stalled =
    broadcast.status === 'SCHEDULED' &&
    pending > 0 &&
    broadcast.scheduledAt !== null &&
    now.getTime() - broadcast.scheduledAt.getTime() >= STALLED_AFTER_MS;
  const operationalStatus: ServiceLineBroadcastOperationalStatus = stalled
    ? 'STALLED'
    : broadcast.status === 'CANCELLED'
      ? 'CANCELLED'
      : broadcast.status === 'SCHEDULED'
        ? 'SCHEDULED'
        : failed > 0
          ? 'NEEDS_ATTENTION'
          : broadcast.recoveryAttempts > 0
            ? 'RECOVERED'
            : 'HEALTHY';
  return {
    ...broadcast,
    operationalStatus,
    failureRate: attempted > 0 ? Number(((failed / attempted) * 100).toFixed(1)) : 0,
    totalRecipients: Object.values(broadcast.recipientCounts).reduce(
      (total, count) => total + (count ?? 0),
      0,
    ),
  };
}

function healthSummary(
  broadcasts: ServiceLineBroadcastOperationalSummary[],
): ServiceLineBroadcastHealthSummary {
  const deliveredRecipients = broadcasts.reduce(
    (total, broadcast) => total + (broadcast.recipientCounts.SENT ?? 0),
    0,
  );
  const failedRecipients = broadcasts.reduce(
    (total, broadcast) => total + (broadcast.recipientCounts.FAILED ?? 0),
    0,
  );
  const attempted = deliveredRecipients + failedRecipients;
  return {
    totalBroadcasts: broadcasts.length,
    stalledBroadcasts: broadcasts.filter((item) => item.operationalStatus === 'STALLED').length,
    broadcastsWithFailures: broadcasts.filter((item) => (item.recipientCounts.FAILED ?? 0) > 0)
      .length,
    deliveredRecipients,
    failedRecipients,
    recoveryAttempts: broadcasts.reduce((total, item) => total + item.recoveryAttempts, 0),
    failureRate: attempted > 0 ? Number(((failedRecipients / attempted) * 100).toFixed(1)) : 0,
  };
}

export class ServiceLineBroadcastOperationsService {
  constructor(
    private readonly repository: ServiceLineBroadcastOperationsRepository,
    private readonly now = () => new Date(),
  ) {}

  async list(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }) {
    const result = await this.repository.list({ ...input, limit: 30, includeIndustries: true });
    if (!result) throw new ApplicationError('FORBIDDEN', 'service broadcast list denied');
    const broadcasts = result.broadcasts.map((broadcast) =>
      withOperationalStatus(broadcast, this.now()),
    );
    return { ...result, broadcasts, health: healthSummary(broadcasts) };
  }

  async exportCsv(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    environment: LineConfigurationEnvironment;
  }) {
    const result = await this.repository.list({ ...input, limit: 5_000, includeIndustries: false });
    if (!result) throw new ApplicationError('FORBIDDEN', 'service broadcast export denied');
    const broadcasts = result.broadcasts.map((broadcast) =>
      withOperationalStatus(broadcast, this.now()),
    );
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
        '運用状態',
        '失敗率',
        '自動回復回数',
      ],
      ...broadcasts.map((broadcast) => [
        broadcast.title,
        broadcast.status,
        broadcast.scheduledAt?.toISOString() ?? null,
        broadcast.createdAt.toISOString(),
        broadcast.completedAt?.toISOString() ?? null,
        broadcast.recipientCounts.SENT ?? 0,
        broadcast.recipientCounts.FAILED ?? 0,
        broadcast.recipientCounts.SKIPPED ?? 0,
        broadcast.recipientCounts.CANCELLED ?? 0,
        broadcast.operationalStatus,
        broadcast.failureRate,
        broadcast.recoveryAttempts,
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
