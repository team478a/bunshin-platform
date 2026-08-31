import { ApplicationError } from '@bunshin/shared';
import type { VideoSceneRecord } from './video-core';

export type VideoSceneGenerationStatus =
  'QUEUED' | 'SUBMITTED' | 'GENERATING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface VideoSceneGenerationRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  ownerUserId: string;
  videoProjectId: string;
  videoSceneId: string;
  projectRevision: number;
  sceneRevision: number;
  provider: string;
  model: string;
  status: VideoSceneGenerationStatus;
  inputSnapshot: Record<string, unknown>;
  estimatedCostUsdMicros: number | null;
  actualCostUsdMicros: number | null;
  externalJobId: string | null;
  outputStorageKey: string | null;
  errorCode: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoSceneGenerationRepository {
  enqueueAiScenes(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
    provider: string;
    model: string;
    estimatedCostUsdMicrosPerSecond: number;
  }): Promise<VideoSceneGenerationRecord[] | null>;
}

const uuid = (value: string, name: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${name}`);
  return value;
};

const boundedText = (value: string, name: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${name}`);
  return normalized;
};

export const isAiVideoScene = (scene: Pick<VideoSceneRecord, 'visualType' | 'aiProcessingTypes'>) =>
  scene.visualType === 'AI_VIDEO' || scene.aiProcessingTypes.includes('VIDEO_GENERATION');

/**
 * Queues one independent generation request per AI-video scene. Provider credentials,
 * reference asset bytes and the final composition are deliberately outside this use case.
 */
export class QueueVideoSceneGenerations {
  constructor(private readonly repository: VideoSceneGenerationRepository) {}

  async execute(input: Parameters<VideoSceneGenerationRepository['enqueueAiScenes']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    if (
      !Number.isSafeInteger(input.estimatedCostUsdMicrosPerSecond) ||
      input.estimatedCostUsdMicrosPerSecond < 0 ||
      input.estimatedCostUsdMicrosPerSecond > 10_000_000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid estimatedCostUsdMicrosPerSecond');
    const value = await this.repository.enqueueAiScenes({
      ...input,
      workspaceId: uuid(input.workspaceId, 'workspaceId'),
      groupId: uuid(input.groupId, 'groupId'),
      actorUserId: uuid(input.actorUserId, 'actorUserId'),
      videoProjectId: uuid(input.videoProjectId, 'videoProjectId'),
      provider: boundedText(input.provider, 'provider', 80),
      model: boundedText(input.model, 'model', 120),
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video scene generation queue conflict');
    if (value.length === 0)
      throw new ApplicationError('VALIDATION_ERROR', 'video project has no AI video scenes');
    return value;
  }
}
