import { ApplicationError } from '@bunshin/shared';
import type { JobEnvironment, VideoRenderStatus } from './index';
import type { VideoSceneGenerationStatus } from './video-ai-scene-generation';
import type { VideoCompletionNotificationStatus } from './video-render-completion';

export const VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES = [
  'PROVIDER_TIMEOUT',
  'CREATOMATE_RATE_LIMIT',
  'CREATOMATE_TIMEOUT_OR_NETWORK',
  'CREATOMATE_PROVIDER_ERROR',
  'VIDEO_RENDER_INFRASTRUCTURE',
  'VIDEO_RENDER_UNEXPECTED',
] as const;

export const VIDEO_AI_SCENE_ADMIN_RETRYABLE_FAILURES = [
  'FAL_RATE_LIMIT',
  'FAL_TIMEOUT_OR_NETWORK',
  'FAL_PROVIDER_ERROR',
  'VIDEO_AI_SCENE_INFRASTRUCTURE',
  'VIDEO_AI_SCENE_UNEXPECTED',
] as const;

export interface VideoRenderOperationsItem {
  id: string;
  projectTitle: string;
  groupName: string;
  provider: string;
  status: VideoRenderStatus;
  errorCode: string | null;
  externalJobRegistered: boolean;
  retryable: boolean;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  usageCountedAt: Date | null;
  notificationStatus: VideoCompletionNotificationStatus | null;
  notifiedAt: Date | null;
}

export interface VideoRenderOperationsSnapshot {
  counts: Record<VideoRenderStatus, number>;
  items: VideoRenderOperationsItem[];
  sceneCounts: Record<VideoSceneGenerationStatus, number>;
  sceneItems: VideoSceneGenerationOperationsItem[];
}

export interface VideoSceneGenerationOperationsItem {
  id: string;
  projectTitle: string;
  groupName: string;
  sceneNo: number;
  provider: string;
  model: string;
  status: VideoSceneGenerationStatus;
  errorCode: string | null;
  estimatedCostUsdMicros: number | null;
  actualCostUsdMicros: number | null;
  retryable: boolean;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface VideoRenderOperationsRepository {
  getSnapshot(input: {
    actorUserId: string;
    environment: JobEnvironment;
  }): Promise<VideoRenderOperationsSnapshot | null>;
  requestRetry(input: {
    requestId: string;
    actorUserId: string;
    environment: JobEnvironment;
    renderId: string;
    reason: string;
  }): Promise<{ id: string; jobId: string; createdAt: Date } | null>;
  requestSceneRetry(input: {
    requestId: string;
    actorUserId: string;
    environment: JobEnvironment;
    generationId: string;
    reason: string;
  }): Promise<{ id: string; jobId: string; createdAt: Date } | null>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GetVideoRenderOperations {
  constructor(private readonly repository: VideoRenderOperationsRepository) {}
  async execute(input: { actorUserId: string; environment: JobEnvironment }) {
    const value = await this.repository.getSnapshot(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'video operations unavailable');
    return value;
  }
}

export class RequestVideoRenderRetry {
  constructor(private readonly repository: VideoRenderOperationsRepository) {}
  async execute(input: {
    requestId: string;
    actorUserId: string;
    environment: JobEnvironment;
    renderId: string;
    reason: string;
  }) {
    const reason = input.reason.trim();
    if (
      !uuid.test(input.requestId) ||
      !uuid.test(input.renderId) ||
      reason.length < 3 ||
      reason.length > 500
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video render retry request');
    const value = await this.repository.requestRetry({ ...input, reason });
    if (!value) throw new ApplicationError('NOT_FOUND', 'retryable video render not found');
    return value;
  }
}

export class RequestVideoSceneGenerationRetry {
  constructor(private readonly repository: VideoRenderOperationsRepository) {}
  async execute(input: {
    requestId: string;
    actorUserId: string;
    environment: JobEnvironment;
    generationId: string;
    reason: string;
  }) {
    const reason = input.reason.trim();
    if (
      !uuid.test(input.requestId) ||
      !uuid.test(input.generationId) ||
      reason.length < 3 ||
      reason.length > 500
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'invalid video scene generation retry request',
      );
    const value = await this.repository.requestSceneRetry({ ...input, reason });
    if (!value)
      throw new ApplicationError('NOT_FOUND', 'retryable video scene generation not found');
    return value;
  }
}
