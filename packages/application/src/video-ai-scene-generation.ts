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
  findForExecution(input: {
    workspaceId: string;
    generationId: string;
  }): Promise<VideoSceneGenerationExecutionContext | null>;
  markSubmitted(input: {
    workspaceId: string;
    generationId: string;
    externalJobId: string;
  }): Promise<VideoSceneGenerationRecord | null>;
  markGenerating(input: {
    workspaceId: string;
    generationId: string;
  }): Promise<VideoSceneGenerationRecord | null>;
  markSucceeded(input: {
    workspaceId: string;
    generationId: string;
    outputStorageKey: string;
  }): Promise<VideoSceneGenerationRecord | null>;
  markFailed(input: {
    workspaceId: string;
    generationId: string;
    errorCode: string;
  }): Promise<VideoSceneGenerationRecord | null>;
}

export interface VideoSceneGenerationExecutionContext {
  generation: VideoSceneGenerationRecord;
  prompt: string;
  durationSeconds: 5 | 10;
  referenceStorageKeys: string[];
}

export interface VideoSceneGenerationProviderPort {
  submit(input: {
    generationId: string;
    model: string;
    prompt: string;
    durationSeconds: 5 | 10;
    referenceImageUrls: string[];
  }): Promise<{ externalJobId: string }>;
  inspect(input: {
    model: string;
    externalJobId: string;
  }): Promise<
    | { status: 'SUBMITTED' | 'GENERATING' }
    | { status: 'SUCCEEDED'; outputUrl: string }
    | { status: 'FAILED'; errorCode: string }
  >;
}

export interface VideoSceneReferenceUrlPort {
  createTemporaryReadUrls(input: { storageKeys: string[] }): Promise<string[]>;
}

export interface VideoSceneGenerationOutputStoragePort {
  store(input: {
    workspaceId: string;
    groupId: string;
    ownerUserId: string;
    generationId: string;
    sourceUrl: string;
  }): Promise<{ storageKey: string }>;
}

export type VideoSceneGenerationExecutionResult =
  | { status: 'PENDING'; generation: VideoSceneGenerationRecord }
  | { status: 'SUCCEEDED'; generation: VideoSceneGenerationRecord }
  | { status: 'FAILED'; generation: VideoSceneGenerationRecord };

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

export class ExecuteVideoSceneGenerationStep {
  constructor(
    private readonly repository: VideoSceneGenerationRepository,
    private readonly provider: VideoSceneGenerationProviderPort,
    private readonly references: VideoSceneReferenceUrlPort,
    private readonly storage: VideoSceneGenerationOutputStoragePort,
  ) {}

  async execute(input: {
    workspaceId: string;
    generationId: string;
  }): Promise<VideoSceneGenerationExecutionResult> {
    const context = await this.repository.findForExecution(input);
    if (!context) throw new ApplicationError('NOT_FOUND', 'video scene generation not found');
    const { generation } = context;
    if (generation.status === 'SUCCEEDED') return { status: 'SUCCEEDED', generation };
    if (generation.status === 'FAILED' || generation.status === 'CANCELLED')
      return { status: 'FAILED', generation };
    if (generation.status === 'QUEUED') {
      const referenceImageUrls = await this.references.createTemporaryReadUrls({
        storageKeys: context.referenceStorageKeys,
      });
      const submitted = await this.provider.submit({
        generationId: generation.id,
        model: generation.model,
        prompt: context.prompt,
        durationSeconds: context.durationSeconds,
        referenceImageUrls,
      });
      const updated = await this.repository.markSubmitted({
        ...input,
        externalJobId: boundedText(submitted.externalJobId, 'externalJobId', 255),
      });
      if (!updated)
        throw new ApplicationError('CONFLICT', 'video scene generation transition conflict');
      return { status: 'PENDING', generation: updated };
    }
    if (!generation.externalJobId)
      throw new ApplicationError('CONFLICT', 'video scene generation external job is missing');
    const inspected = await this.provider.inspect({
      model: generation.model,
      externalJobId: generation.externalJobId,
    });
    if (inspected.status === 'SUBMITTED') return { status: 'PENDING', generation };
    if (inspected.status === 'GENERATING') {
      const updated = await this.repository.markGenerating(input);
      if (!updated)
        throw new ApplicationError('CONFLICT', 'video scene generation transition conflict');
      return { status: 'PENDING', generation: updated };
    }
    if (inspected.status === 'FAILED') {
      const updated = await this.repository.markFailed({
        ...input,
        errorCode: inspected.errorCode,
      });
      if (!updated)
        throw new ApplicationError('CONFLICT', 'video scene generation transition conflict');
      return { status: 'FAILED', generation: updated };
    }
    const stored = await this.storage.store({
      workspaceId: generation.workspaceId,
      groupId: generation.groupId,
      ownerUserId: generation.ownerUserId,
      generationId: generation.id,
      sourceUrl: inspected.outputUrl,
    });
    const updated = await this.repository.markSucceeded({
      ...input,
      outputStorageKey: stored.storageKey,
    });
    if (!updated)
      throw new ApplicationError('CONFLICT', 'video scene generation transition conflict');
    return { status: 'SUCCEEDED', generation: updated };
  }
}
