import 'server-only';
import { createLogger } from '@bunshin/observability';
import type {
  TrainingRetentionAdminPreviewRepository,
  TrainingRetentionAdminPreviewResult,
  TrainingEndDateRepository,
  TrainingEndDateListResult,
} from '@bunshin/capability-training';

export async function loadTrainingRetentionAdminPreview(
  input: Parameters<TrainingRetentionAdminPreviewRepository['preview']>[0],
): Promise<TrainingRetentionAdminPreviewResult | { outcome: 'UNAVAILABLE' }> {
  try {
    const { PrismaTrainingRetentionAdminPreviewRepository } = await import('@bunshin/database');
    return await new PrismaTrainingRetentionAdminPreviewRepository().preview(input);
  } catch {
    createLogger().error('Training retention preview unavailable', {
      workspaceId: input.workspaceId,
      route: '/s/[serviceSlug]/manage/training/retention',
      errorCode: 'TRAINING_RETENTION_PREVIEW_FAILED',
    });
    return { outcome: 'UNAVAILABLE' };
  }
}

export async function loadTrainingUnresolvedEndDates(
  input: Parameters<TrainingEndDateRepository['listUnresolved']>[0],
): Promise<TrainingEndDateListResult | { outcome: 'UNAVAILABLE' }> {
  try {
    const { PrismaTrainingEndDateRepository } = await import('@bunshin/database');
    return await new PrismaTrainingEndDateRepository().listUnresolved(input);
  } catch {
    createLogger().error('Training end date list unavailable', {
      workspaceId: input.workspaceId,
      route: '/s/[serviceSlug]/manage/training/retention',
      errorCode: 'TRAINING_END_DATE_LIST_FAILED',
    });
    return { outcome: 'UNAVAILABLE' };
  }
}
