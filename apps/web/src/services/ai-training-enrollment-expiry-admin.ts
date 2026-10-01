import 'server-only';
import type {
  TrainingEnrollmentExpiryAdminPreviewRepository,
  TrainingEnrollmentExpiryAdminPreviewResult,
} from '@bunshin/capability-training';
import { createLogger } from '@bunshin/observability';

export async function loadTrainingEnrollmentExpiryAdminPreview(
  input: Parameters<TrainingEnrollmentExpiryAdminPreviewRepository['preview']>[0],
): Promise<TrainingEnrollmentExpiryAdminPreviewResult | { outcome: 'UNAVAILABLE' }> {
  try {
    const { PrismaTrainingEnrollmentExpiryAdminPreviewRepository } =
      await import('@bunshin/database');
    return await new PrismaTrainingEnrollmentExpiryAdminPreviewRepository().preview(input);
  } catch {
    createLogger().error('Training enrollment expiry preview unavailable', {
      workspaceId: input.workspaceId,
      route: '/s/[serviceSlug]/manage/training/expiry',
      errorCode: 'TRAINING_ENROLLMENT_EXPIRY_PREVIEW_FAILED',
    });
    return { outcome: 'UNAVAILABLE' };
  }
}
