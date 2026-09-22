import type {
  VideoAiProcessingType,
  VideoNarrationSpeed,
  VideoNarrationVoice,
  VideoPlatform,
  VideoProjectRecord,
  VideoRenderRecord,
  VideoSceneRecord,
} from '@bunshin/application';
import type { Prisma } from './client';

const videoSceneRecord = (row: Prisma.VideoSceneGetPayload<object>): VideoSceneRecord => ({
  ...row,
  keywords: row.keywords as unknown as string[],
  aiProcessingTypes: row.aiProcessingTypes as unknown as VideoAiProcessingType[],
});

export const videoProjectRecord = (
  row: Prisma.VideoProjectGetPayload<{ include: { scenes: true } }>,
): VideoProjectRecord => ({
  ...row,
  platform: row.platform as VideoPlatform,
  durationSeconds: row.durationSeconds as 25 | 30 | 60,
  narrationVoice: row.narrationVoice as VideoNarrationVoice,
  narrationSpeed: row.narrationSpeed as VideoNarrationSpeed,
  reviewDecision: row.reviewDecision as 'ADOPTED' | 'REJECTED' | null,
  aiProcessingTypes: row.aiProcessingTypes as unknown as VideoAiProcessingType[],
  disclosureSnapshot: row.disclosureSnapshot as Record<string, unknown>,
  characterProfileSnapshot: row.characterProfileSnapshot as Record<string, unknown>,
  characterReferenceSnapshot: row.characterReferenceSnapshot as Array<Record<string, unknown>>,
  scenes: row.scenes.map(videoSceneRecord),
});

export const assetRetentionExpiry = (from = new Date()) =>
  new Date(from.getTime() + 90 * 24 * 60 * 60 * 1000);

export const videoRenderRecord = (row: Prisma.VideoRenderGetPayload<object>): VideoRenderRecord => {
  const { notificationSnapshot, ...record } = row;
  void notificationSnapshot;
  return record;
};
