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
}

export interface VideoPlanningContext {
  objective: string;
  audience: string;
  personality: {
    tone: string;
    preferredExpressions: string[];
    prohibitedExpressions: string[];
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
