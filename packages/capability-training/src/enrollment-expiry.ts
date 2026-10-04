export type TrainingEnrollmentExpiryPreviewScope = {
  workspaceId: string;
  groupId: string;
  now: Date;
};

export type TrainingEnrollmentExpiryPreviewSummary = {
  eligible: number;
  batchLimit: number;
  requiredBatches: number;
  hasMore: boolean;
  cutoffAt: string;
};

export type TrainingEnrollmentExpiryAdminPreviewResult =
  | { outcome: 'PREVIEW'; summary: TrainingEnrollmentExpiryPreviewSummary }
  | { outcome: 'FORBIDDEN' };

export interface TrainingEnrollmentExpiryAdminPreviewRepository {
  preview(
    input: TrainingEnrollmentExpiryPreviewScope & { actorUserId: string },
  ): Promise<TrainingEnrollmentExpiryAdminPreviewResult>;
}
