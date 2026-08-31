import { ApplicationError } from '@bunshin/shared';

export type VideoPlatform = 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE_SHORTS';
export type VideoProjectType = 'EXPLAINER' | 'PRODUCT_INTRODUCTION' | 'PHOTO_SLIDESHOW';
export type VideoProjectStatus =
  | 'DRAFT'
  | 'PLANNING'
  | 'WAITING_APPROVAL'
  | 'APPROVED'
  | 'QUEUED'
  | 'RENDERING'
  | 'QUALITY_CHECK'
  | 'READY_FOR_REVIEW'
  | 'REVISING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
export type VideoSceneVisualType =
  'USER_ASSET' | 'APPROVED_ASSET' | 'STOCK_IMAGE' | 'GENERATED_IMAGE' | 'TEXT_MOTION' | 'AI_VIDEO';
export type VideoAiProcessingType =
  | 'SCRIPT_GENERATION'
  | 'VOICE_SYNTHESIS'
  | 'IMAGE_GENERATION'
  | 'VIDEO_GENERATION'
  | 'AUTOMATIC_ASSET_SELECTION';

export interface VideoSceneRecord {
  id: string;
  videoProjectId: string;
  sceneNo: number;
  durationMs: number;
  narration: string;
  caption: string;
  visualType: VideoSceneVisualType;
  visualPrompt: string | null;
  keywords: string[];
  aiProcessingTypes: VideoAiProcessingType[];
  locked: boolean;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoProjectRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  ownerUserId: string;
  bunshinId: string;
  campaignId: string | null;
  characterProfileVersionId: string | null;
  characterProfileSnapshot: Record<string, unknown>;
  characterReferenceSnapshot: Array<Record<string, unknown>>;
  title: string;
  platform: VideoPlatform;
  type: VideoProjectType;
  durationSeconds: 30 | 60;
  status: VideoProjectStatus;
  revision: number;
  aiProcessingTypes: VideoAiProcessingType[];
  disclosureSnapshot: Record<string, unknown>;
  standardComposition: boolean;
  aiVideoSceneCount: number;
  scenes: VideoSceneRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoProjectRepository {
  create(input: {
    workspaceId: string;
    groupId: string;
    groupMembershipId: string;
    actorUserId: string;
    bunshinId: string;
    campaignId: string | null;
    characterProfileVersionId: string | null;
    title: string;
    platform: VideoPlatform;
    type: VideoProjectType;
    durationSeconds: 30 | 60;
    aiProcessingTypes: VideoAiProcessingType[];
    disclosureSnapshot: Record<string, unknown>;
  }): Promise<VideoProjectRecord | null>;
  findOwned(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
  }): Promise<VideoProjectRecord | null>;
  replacePlan(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
    scenes: Array<
      Omit<VideoSceneRecord, 'id' | 'videoProjectId' | 'revision' | 'createdAt' | 'updatedAt'>
    >;
    projectAiProcessingTypes: VideoAiProcessingType[];
    standardComposition: boolean;
    aiVideoSceneCount: number;
  }): Promise<VideoProjectRecord | null>;
  approvePlan(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
  }): Promise<VideoProjectRecord | null>;
}

export type VideoRenderStatus =
  'QUEUED' | 'SUBMITTED' | 'RENDERING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface VideoRenderRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  ownerUserId: string;
  videoProjectId: string;
  projectRevision: number;
  provider: string;
  status: VideoRenderStatus;
  externalJobId: string | null;
  outputStorageKey: string | null;
  errorCode: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface VideoRenderRepository {
  enqueueApproved(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
    provider: string;
  }): Promise<VideoRenderRecord | null>;
  findForExecution(input: {
    workspaceId: string;
    renderId: string;
  }): Promise<{ render: VideoRenderRecord; project: VideoProjectRecord } | null>;
  markSubmitted(input: {
    workspaceId: string;
    renderId: string;
    externalJobId: string;
  }): Promise<VideoRenderRecord | null>;
  markRendering(input: {
    workspaceId: string;
    renderId: string;
  }): Promise<VideoRenderRecord | null>;
  markSucceeded(input: {
    workspaceId: string;
    renderId: string;
    outputStorageKey: string;
  }): Promise<VideoRenderRecord | null>;
  markFailed(input: {
    workspaceId: string;
    renderId: string;
    errorCode: string;
  }): Promise<VideoRenderRecord | null>;
}

export interface VideoRenderProviderPort {
  submit(input: {
    renderId: string;
    project: VideoProjectRecord;
    webhookUrl: string;
  }): Promise<{ externalJobId: string }>;
  inspect(input: {
    externalJobId: string;
  }): Promise<
    | { status: 'SUBMITTED' | 'RENDERING' }
    | { status: 'SUCCEEDED'; outputUrl: string }
    | { status: 'FAILED'; errorCode: string }
  >;
}

export interface VideoRenderWebhookPort {
  createUrl(input: { workspaceId: string; renderId: string }): Promise<string>;
}

export interface VideoRenderOutputStoragePort {
  store(input: {
    workspaceId: string;
    groupId: string;
    ownerUserId: string;
    renderId: string;
    sourceUrl: string;
  }): Promise<{ storageKey: string }>;
}

export type VideoRenderExecutionResult =
  | { status: 'PENDING'; render: VideoRenderRecord }
  | { status: 'SUCCEEDED'; render: VideoRenderRecord }
  | { status: 'FAILED'; render: VideoRenderRecord };

export interface VideoPlanningContext {
  objective: string;
  audience: string;
  personality: {
    tone: string;
    preferredExpressions: string[];
    prohibitedExpressions: string[];
  };
  character: null | {
    name: string;
    appearance: string;
    worldSetting: string;
    safetyRules: string[];
    referenceImageCount: number;
  };
  product: null | {
    name: string;
    facts: string[];
    requiredDisclosures: string[];
    prohibitedExpressions: string[];
  };
  approvedAssets: Array<{
    assetId: string;
    description: string;
  }>;
  userAssets: Array<{
    assetId: string;
    kind: 'IMAGE' | 'VIDEO' | 'LOGO';
    description: string;
  }>;
}

export interface VideoPlanningContextRepository {
  findAuthorized(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    bunshinId: string;
    campaignId: string | null;
  }): Promise<VideoPlanningContext | null>;
}

export interface VideoPlanGeneratorInput {
  project: {
    title: string;
    platform: VideoPlatform;
    type: VideoProjectType;
    durationSeconds: 30 | 60;
    standardComposition: boolean;
  };
  context: VideoPlanningContext;
}

export interface VideoPlanGeneratorOutput {
  scenes: Array<{
    sceneNo: number;
    durationMs: number;
    narration: string;
    caption: string;
    visualType: VideoSceneVisualType;
    visualPrompt: string | null;
    keywords: string[];
    aiProcessingTypes: VideoAiProcessingType[];
  }>;
  projectAiProcessingTypes: VideoAiProcessingType[];
}

export interface VideoPlanGeneratorResult {
  output: VideoPlanGeneratorOutput;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface VideoPlanGeneratorPort {
  generate(input: VideoPlanGeneratorInput): Promise<VideoPlanGeneratorResult>;
}

const validAiTypes = new Set<VideoAiProcessingType>([
  'SCRIPT_GENERATION',
  'VOICE_SYNTHESIS',
  'IMAGE_GENERATION',
  'VIDEO_GENERATION',
  'AUTOMATIC_ASSET_SELECTION',
]);
const id = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};
const text = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};
const aiTypes = (values: VideoAiProcessingType[]) => {
  const unique = [...new Set(values)];
  if (unique.length > validAiTypes.size || unique.some((value) => !validAiTypes.has(value)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid aiProcessingTypes');
  return unique;
};

export class CreateVideoProject {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['create']>[0]) {
    if (![30, 60].includes(input.durationSeconds))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid durationSeconds');
    const value = await this.repository.create({
      ...input,
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      groupMembershipId: id(input.groupMembershipId, 'groupMembershipId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      bunshinId: id(input.bunshinId, 'bunshinId'),
      campaignId: input.campaignId ? id(input.campaignId, 'campaignId') : null,
      characterProfileVersionId: input.characterProfileVersionId
        ? id(input.characterProfileVersionId, 'characterProfileVersionId')
        : null,
      title: text(input.title, 'title', 160),
      aiProcessingTypes: aiTypes(input.aiProcessingTypes),
    });
    if (!value) throw new ApplicationError('FORBIDDEN', 'video project unavailable');
    return value;
  }
}

export class GetVideoProject {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['findOwned']>[0]) {
    const value = await this.repository.findOwned({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'video project not found');
    return value;
  }
}

export class ReplaceVideoPlan {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['replacePlan']>[0]) {
    const count = input.scenes.length;
    const durationSeconds = input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0) / 1000;
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    if (![30, 60].includes(durationSeconds))
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'scene duration total must be 30 or 60 seconds',
      );
    if (
      (durationSeconds === 30 && (count < 5 || count > 7)) ||
      (durationSeconds === 60 && (count < 8 || count > 12))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid scene count');
    const sceneNumbers = new Set<number>();
    const scenes = input.scenes.map((scene) => {
      if (!Number.isInteger(scene.sceneNo) || scene.sceneNo < 1 || sceneNumbers.has(scene.sceneNo))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid sceneNo');
      sceneNumbers.add(scene.sceneNo);
      if (
        !Number.isInteger(scene.durationMs) ||
        scene.durationMs < 500 ||
        scene.durationMs > 60_000
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid scene duration');
      const types = aiTypes(scene.aiProcessingTypes);
      if (
        input.standardComposition &&
        (scene.visualType === 'AI_VIDEO' || types.includes('VIDEO_GENERATION'))
      )
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'standard composition cannot contain AI video',
        );
      return {
        ...scene,
        narration: text(scene.narration, 'narration', 2_000),
        caption: text(scene.caption, 'caption', 240),
        visualPrompt: scene.visualPrompt?.trim() || null,
        keywords: [...new Set(scene.keywords.map((keyword) => text(keyword, 'keyword', 80)))].slice(
          0,
          20,
        ),
        aiProcessingTypes: types,
      };
    });
    if ([...sceneNumbers].sort((a, b) => a - b).some((value, index) => value !== index + 1))
      throw new ApplicationError('VALIDATION_ERROR', 'scene numbers must be consecutive');
    const aiVideoSceneCount = scenes.filter((scene) => scene.visualType === 'AI_VIDEO').length;
    if (aiVideoSceneCount !== input.aiVideoSceneCount)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid aiVideoSceneCount');
    const value = await this.repository.replacePlan({
      ...input,
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
      scenes,
      projectAiProcessingTypes: aiTypes(input.projectAiProcessingTypes),
      aiVideoSceneCount,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video project revision conflict');
    return value;
  }
}

export class ApproveVideoPlan {
  constructor(private readonly repository: VideoProjectRepository) {}
  async execute(input: Parameters<VideoProjectRepository['approvePlan']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    const value = await this.repository.approvePlan({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
      expectedRevision: input.expectedRevision,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video project approval conflict');
    return value;
  }
}

export class QueueVideoRender {
  constructor(private readonly repository: VideoRenderRepository) {}
  async execute(input: Parameters<VideoRenderRepository['enqueueApproved']>[0]) {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expectedRevision');
    const provider = text(input.provider, 'provider', 80);
    const value = await this.repository.enqueueApproved({
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
      expectedRevision: input.expectedRevision,
      provider,
    });
    if (!value) throw new ApplicationError('CONFLICT', 'video render queue conflict');
    return value;
  }
}

export class ExecuteVideoRenderStep {
  constructor(
    private readonly repository: VideoRenderRepository,
    private readonly provider: VideoRenderProviderPort,
    private readonly storage: VideoRenderOutputStoragePort,
    private readonly webhook: VideoRenderWebhookPort,
  ) {}

  async execute(input: {
    workspaceId: string;
    renderId: string;
  }): Promise<VideoRenderExecutionResult> {
    const scope = {
      workspaceId: id(input.workspaceId, 'workspaceId'),
      renderId: id(input.renderId, 'renderId'),
    };
    const value = await this.repository.findForExecution(scope);
    if (!value) throw new ApplicationError('NOT_FOUND', 'video render not found');
    if (value.render.provider !== 'CREATOMATE')
      throw new ApplicationError('CONFIGURATION_ERROR', 'unsupported video render provider');
    if (value.render.status === 'SUCCEEDED') return { status: 'SUCCEEDED', render: value.render };
    if (value.render.status === 'FAILED' || value.render.status === 'CANCELLED')
      return { status: 'FAILED', render: value.render };

    let render = value.render;
    if (render.status === 'QUEUED') {
      const webhookUrl = await this.webhook.createUrl(scope);
      const submitted = await this.provider.submit({
        renderId: render.id,
        project: value.project,
        webhookUrl,
      });
      const updated = await this.repository.markSubmitted({
        ...scope,
        externalJobId: text(submitted.externalJobId, 'externalJobId', 255),
      });
      if (!updated) throw new ApplicationError('CONFLICT', 'video render transition conflict');
      return { status: 'PENDING', render: updated };
    }
    if (!render.externalJobId)
      throw new ApplicationError('CONFLICT', 'video render external job is missing');
    const inspected = await this.provider.inspect({ externalJobId: render.externalJobId });
    if (inspected.status === 'SUBMITTED' || inspected.status === 'RENDERING') {
      if (inspected.status === 'RENDERING') {
        const updated = await this.repository.markRendering(scope);
        if (updated) render = updated;
      }
      return { status: 'PENDING', render };
    }
    if (inspected.status === 'FAILED') {
      const failed = await this.repository.markFailed({
        ...scope,
        errorCode: text(inspected.errorCode, 'errorCode', 80),
      });
      if (!failed) throw new ApplicationError('CONFLICT', 'video render transition conflict');
      return { status: 'FAILED', render: failed };
    }
    if (inspected.status !== 'SUCCEEDED')
      throw new ApplicationError('INTERNAL_ERROR', 'invalid video render status');
    const stored = await this.storage.store({
      ...scope,
      groupId: value.render.groupId,
      ownerUserId: value.render.ownerUserId,
      sourceUrl: inspected.outputUrl,
    });
    const succeeded = await this.repository.markSucceeded({
      ...scope,
      outputStorageKey: text(stored.storageKey, 'outputStorageKey', 512),
    });
    if (!succeeded) throw new ApplicationError('CONFLICT', 'video render transition conflict');
    return { status: 'SUCCEEDED', render: succeeded };
  }
}

export class GenerateVideoPlan {
  constructor(
    private readonly projects: VideoProjectRepository,
    private readonly contexts: VideoPlanningContextRepository,
    private readonly generator: VideoPlanGeneratorPort,
  ) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
  }) {
    const scope = {
      workspaceId: id(input.workspaceId, 'workspaceId'),
      groupId: id(input.groupId, 'groupId'),
      actorUserId: id(input.actorUserId, 'actorUserId'),
      videoProjectId: id(input.videoProjectId, 'videoProjectId'),
    };
    const project = await this.projects.findOwned(scope);
    if (!project) throw new ApplicationError('NOT_FOUND', 'video project not found');
    if (project.revision !== input.expectedRevision)
      throw new ApplicationError('CONFLICT', 'video project revision conflict');
    const context = await this.contexts.findAuthorized({
      ...scope,
      bunshinId: project.bunshinId,
      campaignId: project.campaignId,
    });
    if (!context) throw new ApplicationError('FORBIDDEN', 'video planning context unavailable');
    const generated = await this.generator.generate({
      project: {
        title: project.title,
        platform: project.platform,
        type: project.type,
        durationSeconds: project.durationSeconds,
        standardComposition: project.standardComposition,
      },
      context,
    });
    const saved = await new ReplaceVideoPlan(this.projects).execute({
      ...scope,
      expectedRevision: input.expectedRevision,
      scenes: generated.output.scenes.map((scene) => ({ ...scene, locked: false })),
      projectAiProcessingTypes: generated.output.projectAiProcessingTypes,
      standardComposition: project.standardComposition,
      aiVideoSceneCount: generated.output.scenes.filter((scene) => scene.visualType === 'AI_VIDEO')
        .length,
    });
    return { project: saved, generation: generated };
  }
}
