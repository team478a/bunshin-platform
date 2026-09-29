export type TrainingEnrollmentStatus = 'INVITED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type TrainingLifecycleAction = 'COMPLETE' | 'CANCEL' | 'REOPEN';
export const TRAINING_ENROLLMENT_STATUS_LABELS: Record<TrainingEnrollmentStatus, string> = {
  INVITED: '招待中',
  ACTIVE: '受講中',
  COMPLETED: '終了',
  CANCELLED: '取消',
  EXPIRED: '期限終了',
};
export function trainingLifecycleTarget(
  status: TrainingEnrollmentStatus,
  action: TrainingLifecycleAction,
): TrainingEnrollmentStatus | null {
  if (status === 'ACTIVE')
    return action === 'COMPLETE' ? 'COMPLETED' : action === 'CANCEL' ? 'CANCELLED' : null;
  return action === 'REOPEN' && ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(status)
    ? 'ACTIVE'
    : null;
}
export interface TrainingLifecycleScope {
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  actorUserId: string;
}
export interface TrainingLifecycleChange extends TrainingLifecycleScope {
  action: TrainingLifecycleAction;
  expectedStatus: TrainingEnrollmentStatus;
  expectedUpdatedAt: Date;
  operationId: string;
  reason: string;
  now: Date;
}
export type TrainingLifecycleResult =
  | { outcome: 'APPLIED' | 'ALREADY_APPLIED'; status: TrainingEnrollmentStatus }
  | { outcome: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'REOPEN_UNAVAILABLE' };
export interface TrainingLifecycleRepository {
  change(input: TrainingLifecycleChange): Promise<TrainingLifecycleResult>;
}
