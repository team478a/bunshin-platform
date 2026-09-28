const DAY_MS = 24 * 60 * 60 * 1000;
export const TRAINING_RETENTION_POLICY_VERSION = 'TRAINING_RETENTION_V1';
export const TRAINING_RETENTION_MAX_ENROLLMENTS = 100;

export function trainingAnswerRetentionCutoff(now: Date): Date {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid retention clock');
  return new Date(now.getTime() - 90 * DAY_MS);
}

export function trainingEndRetentionEligibility(endedAt: Date | null, now: Date) {
  trainingAnswerRetentionCutoff(now);
  if (!endedAt || !Number.isFinite(endedAt.getTime()) || endedAt > now) {
    return { workInformationDue: false, progressAndScoresDue: false, endDateKnown: false };
  }
  const anniversary = new Date(endedAt);
  // Clamp leap-day anniversaries instead of rolling them into March.
  anniversary.setUTCDate(1);
  anniversary.setUTCFullYear(endedAt.getUTCFullYear() + 1);
  const lastDay = new Date(
    Date.UTC(anniversary.getUTCFullYear(), endedAt.getUTCMonth() + 1, 0),
  ).getUTCDate();
  anniversary.setUTCDate(Math.min(endedAt.getUTCDate(), lastDay));
  return {
    workInformationDue: endedAt.getTime() + 90 * DAY_MS <= now.getTime(),
    progressAndScoresDue: anniversary <= now,
    endDateKnown: true,
  };
}

export interface TrainingRetentionPreviewScope {
  workspaceId: string;
  groupId: string;
  now: Date;
}
export interface TrainingRetentionPreviewSummary {
  policyVersion: typeof TRAINING_RETENTION_POLICY_VERSION;
  mode: 'DRY_RUN';
  enrollments: number;
  answersAndEvaluationsDue: number;
  workProfilesDue: number;
  scoreProfilesDue: number;
  progressSnapshotsDue: number;
  retainedToolkit: number;
  endDateUnresolved: number;
  ownershipUnresolved: number;
}
export type TrainingRetentionPreviewResult =
  { outcome: 'PREVIEW'; summary: TrainingRetentionPreviewSummary } | { outcome: 'TOO_LARGE' };
export interface TrainingRetentionPreviewRepository {
  preview(input: TrainingRetentionPreviewScope): Promise<TrainingRetentionPreviewResult>;
}

export interface TrainingRetentionExecutionScope {
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  operatorUserId: string;
  now: Date;
}
export interface TrainingRetentionExecutionCounts {
  answers: number;
  workProfiles: number;
  progressProfiles: number;
  progressSnapshots: number;
  assignmentSnapshots: number;
  assignments: number;
  activities: number;
  goals: number;
  preferences: number;
  retainedToolkit: number;
}
export type TrainingRetentionExecutionPreview = {
  revision: string;
  counts: TrainingRetentionExecutionCounts;
  endDateUnresolved: boolean;
};
export type TrainingRetentionExecutionResult =
  | { outcome: 'PREVIEW'; preview: TrainingRetentionExecutionPreview }
  | { outcome: 'APPLIED' | 'ALREADY_APPLIED'; counts: TrainingRetentionExecutionCounts }
  | { outcome: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'TOO_LARGE' };
export interface TrainingRetentionExecutionRepository {
  preview(input: TrainingRetentionExecutionScope): Promise<TrainingRetentionExecutionResult>;
  execute(
    input: TrainingRetentionExecutionScope & { revision: string },
  ): Promise<TrainingRetentionExecutionResult>;
}

export function trainingRetentionEndDate(input: {
  status: string;
  endsAt: Date | null;
  recordedEnd: Date | null;
}): Date | null {
  if (!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(input.status)) return null;
  return input.recordedEnd ?? (input.status === 'EXPIRED' ? input.endsAt : null);
}
