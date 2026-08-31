import { ApplicationError } from '@bunshin/shared';
import type { VideoSceneRecord } from './video-core';

export type VideoSceneGenerationStatus =
  'QUEUED' | 'SUBMITTED' | 'GENERATING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type VideoAiProvider = 'FAL' | 'RUNWAY';

export interface VideoAiProviderCostPolicy {
  provider: VideoAiProvider;
  model: string;
  globallyPaused: boolean;
  dailyBudgetUsdMicros: number;
  monthlyBudgetUsdMicros: number;
  maxSceneCostUsdMicros: number;
}

export interface VideoAiProviderCostPolicyRepository {
  findActive(input: {
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    provider: VideoAiProvider;
    model: string;
    dailyFrom: Date;
    monthlyFrom: Date;
    now: Date;
  }): Promise<{
    policy: VideoAiProviderCostPolicy;
    dailySpentUsdMicros: number;
    monthlySpentUsdMicros: number;
  } | null>;
}

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

export class AuthorizeVideoAiGenerationCost {
  constructor(private readonly policies: VideoAiProviderCostPolicyRepository) {}

  async execute(input: {
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    provider: VideoAiProvider;
    model: string;
    estimatedSceneCostsUsdMicros: number[];
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const model = boundedText(input.model, 'model', 120);
    if (
      input.estimatedSceneCostsUsdMicros.length === 0 ||
      input.estimatedSceneCostsUsdMicros.length > 12
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid estimated scene costs');
    if (
      input.estimatedSceneCostsUsdMicros.some((value) => !Number.isSafeInteger(value) || value < 0)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid estimated scene costs');
    const dailyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthlyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const value = await this.policies.findActive({
      environment: input.environment,
      provider: input.provider,
      model,
      dailyFrom,
      monthlyFrom,
      now,
    });
    if (!value) throw new ApplicationError('CONFIGURATION_ERROR', 'active video provider required');
    const { policy } = value;
    if (policy.globallyPaused)
      throw new ApplicationError('CONFIGURATION_ERROR', 'video provider is paused');
    if (policy.provider !== input.provider || policy.model !== model)
      throw new ApplicationError('CONFIGURATION_ERROR', 'video provider policy scope mismatch');
    if (input.estimatedSceneCostsUsdMicros.some((cost) => cost > policy.maxSceneCostUsdMicros))
      throw new ApplicationError('CONFLICT', 'video scene cost limit exceeded');
    const totalEstimatedCostUsdMicros = input.estimatedSceneCostsUsdMicros.reduce(
      (sum, cost) => sum + cost,
      0,
    );
    if (value.dailySpentUsdMicros + totalEstimatedCostUsdMicros > policy.dailyBudgetUsdMicros)
      throw new ApplicationError('CONFLICT', 'daily video provider budget reached');
    if (value.monthlySpentUsdMicros + totalEstimatedCostUsdMicros > policy.monthlyBudgetUsdMicros)
      throw new ApplicationError('CONFLICT', 'monthly video provider budget reached');
    return { policy, totalEstimatedCostUsdMicros };
  }
}

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
