import type { JobDispatcher, JobEnvironment } from './job-runtime';

export interface RecoverableServiceLineBroadcast {
  workspaceId: string;
  broadcastId: string;
  requestedBy: string;
  scheduledAt: Date;
  updatedAt: Date;
}

export interface ServiceLineBroadcastRecoveryRepository {
  listUnqueued(input: {
    environment: JobEnvironment;
    limit: number;
  }): Promise<{ candidates: RecoverableServiceLineBroadcast[]; truncated: boolean }>;
}

export interface ServiceLineBroadcastRecoverySummary {
  candidates: number;
  enqueued: number;
  failures: number;
  truncated: boolean;
}

export const serviceLineBroadcastRecoveryKey = (candidate: RecoverableServiceLineBroadcast) =>
  `service-line-broadcast-recovery:${candidate.broadcastId}:${candidate.updatedAt.toISOString()}`;

export class RecoverServiceLineBroadcastJobs {
  constructor(
    private readonly repository: ServiceLineBroadcastRecoveryRepository,
    private readonly jobs: JobDispatcher,
  ) {}

  async execute(
    environment: JobEnvironment,
    limit = 100,
  ): Promise<ServiceLineBroadcastRecoverySummary> {
    const result = await this.repository.listUnqueued({ environment, limit });
    const summary: ServiceLineBroadcastRecoverySummary = {
      candidates: result.candidates.length,
      enqueued: 0,
      failures: 0,
      truncated: result.truncated,
    };
    for (const candidate of result.candidates) {
      try {
        await this.jobs.enqueue({
          environment,
          workspaceId: candidate.workspaceId,
          correlationId: `service-line-broadcast:${candidate.broadcastId}`,
          requestedBy: candidate.requestedBy,
          jobType: 'SERVICE_LINE_BROADCAST_DELIVER',
          payloadReference: `service-line-broadcast:${candidate.broadcastId}`,
          idempotencyKey: serviceLineBroadcastRecoveryKey(candidate),
          priority: 40,
          maxAttempts: 3,
          scheduledAt: candidate.scheduledAt,
        });
        summary.enqueued += 1;
      } catch {
        summary.failures += 1;
      }
    }
    return summary;
  }
}
