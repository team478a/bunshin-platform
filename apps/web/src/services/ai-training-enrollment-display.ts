import type { TrainingEnrollmentStatus } from '@bunshin/capability-training';

export type TrainingEnrollmentDisplayStatus =
  TrainingEnrollmentStatus | 'PERIOD_ENDED' | 'BEFORE_START' | 'START_UNRESOLVED';
export const TRAINING_ENROLLMENT_DISPLAY_LABELS: Record<TrainingEnrollmentDisplayStatus, string> = {
  INVITED: '招待中',
  ACTIVE: '受講中',
  COMPLETED: '終了',
  CANCELLED: '取消',
  EXPIRED: '期限終了',
  PERIOD_ENDED: '期限終了（状態未更新）',
  BEFORE_START: '開始前',
  START_UNRESOLVED: '開始日時未確定',
};

// Display projection only. Never use this value as the lifecycle CAS status or
// a recorded retention origin. Terminal registration states take precedence.
export function trainingEnrollmentDisplayStatus(
  input: {
    status: TrainingEnrollmentStatus;
    startsAt: Date | null;
    endsAt: Date | null;
  },
  now: Date,
): TrainingEnrollmentDisplayStatus {
  if (input.status !== 'ACTIVE') return input.status;
  if (input.endsAt && input.endsAt <= now) return 'PERIOD_ENDED';
  if (!input.startsAt) return 'START_UNRESOLVED';
  if (input.startsAt > now) return 'BEFORE_START';
  return 'ACTIVE';
}
