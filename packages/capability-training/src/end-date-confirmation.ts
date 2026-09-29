import type { TrainingLifecycleScope } from './enrollment-lifecycle';

export interface TrainingEndDateInput extends TrainingLifecycleScope {
  endedAt: Date;
  reason: string;
  now: Date;
}
export interface TrainingEndDatePreview {
  revision: string;
  status: 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  endedAt: string;
  workInformationDue: boolean;
  progressAndScoresDue: boolean;
}
export type TrainingEndDateResult =
  | { outcome: 'PREVIEW'; preview: TrainingEndDatePreview }
  | { outcome: 'APPLIED' | 'ALREADY_APPLIED'; endedAt: string }
  | { outcome: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID_DATE' };
export interface TrainingEndDateRepository {
  listUnresolved(
    input: Pick<TrainingLifecycleScope, 'workspaceId' | 'groupId' | 'actorUserId'>,
  ): Promise<TrainingEndDateListResult>;
  preview(input: TrainingEndDateInput): Promise<TrainingEndDateResult>;
  confirm(
    input: TrainingEndDateInput & { revision: string; operationId: string },
  ): Promise<TrainingEndDateResult>;
}

export type TrainingEndDateListResult =
  | {
      outcome: 'ROWS';
      rows: Array<{
        enrollmentId: string;
        participantLabel: string;
        programLabel: string;
        status: 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
        startsAt: string | null;
        updatedAt: string;
      }>;
    }
  | { outcome: 'FORBIDDEN' }
  | { outcome: 'TOO_LARGE' };
