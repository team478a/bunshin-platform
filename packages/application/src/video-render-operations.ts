import { ApplicationError } from '@bunshin/shared';
import type { JobEnvironment, VideoRenderStatus } from './index';
import type { VideoCompletionNotificationStatus } from './video-render-completion';

export const VIDEO_RENDER_ADMIN_RETRYABLE_FAILURES = [
  'PROVIDER_TIMEOUT',
  'CREATOMATE_RATE_LIMIT',
  'CREATOMATE_TIMEOUT_OR_NETWORK',
  'CREATOMATE_PROVIDER_ERROR',
  'VIDEO_RENDER_INFRASTRUCTURE',
  'VIDEO_RENDER_UNEXPECTED',
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
