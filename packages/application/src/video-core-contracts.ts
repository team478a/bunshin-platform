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
export type VideoDurationSeconds = 25 | 30 | 60;
export const VIDEO_NARRATION_VOICES = ['marin', 'cedar', 'coral'] as const;
export type VideoNarrationVoice = (typeof VIDEO_NARRATION_VOICES)[number];
export const DEFAULT_VIDEO_NARRATION_VOICE: VideoNarrationVoice = 'marin';
export const VIDEO_NARRATION_SPEEDS = ['SLOW', 'STANDARD'] as const;
export type VideoNarrationSpeed = (typeof VIDEO_NARRATION_SPEEDS)[number];
export const DEFAULT_VIDEO_NARRATION_SPEED: VideoNarrationSpeed = 'STANDARD';
export type VideoReviewDecision = 'ADOPTED' | 'REJECTED';
export type VideoReviewReason =
  | 'NARRATION_HARD_TO_HEAR'
  | 'AI_VOICE_UNNATURAL'
  | 'CONTENT_MISMATCH'
  | 'VISUAL_UNNATURAL'
  | 'TOO_LONG'
  | 'OTHER';

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
  photoAssetIds?: string[];
  narrationEnabled?: boolean;
  narrationVoice?: VideoNarrationVoice;
  narrationSpeed?: VideoNarrationSpeed;
  socialImageGenerationRequestId?: string | null;
  reviewDecision?: VideoReviewDecision | null;
  reviewReason?: string | null;
  reviewNote?: string | null;
  reviewedAt?: Date | null;
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
  durationSeconds: VideoDurationSeconds;
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
    photoAssetIds?: string[];
    narrationEnabled?: boolean;
    narrationVoice?: VideoNarrationVoice;
    narrationSpeed?: VideoNarrationSpeed;
    socialImageGenerationRequestId?: string | null;
    id?: string;
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
    durationSeconds: VideoDurationSeconds;
    standardComposition: boolean;
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
  updateNarrationSettings(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
    voice: VideoNarrationVoice;
    speed: VideoNarrationSpeed;
  }): Promise<VideoProjectRecord | null>;
}

export type VideoProjectReviewAction = 'ADOPT' | 'REVISE';

export interface VideoProjectReviewRepository {
  review(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoProjectId: string;
    expectedRevision: number;
    action: VideoProjectReviewAction;
    reviewReason: VideoReviewReason | null;
    reviewNote: string | null;
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
  }): Promise<VideoRenderExecutionContext | null>;
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

/**
 * The render worker receives storage keys, never a public scene URL.  It creates short-lived
 * URLs immediately before submitting the composition to the render provider.
 */
export interface VideoRenderExecutionContext {
  render: VideoRenderRecord;
  project: VideoProjectRecord;
  aiSceneSources: Array<{ videoSceneId: string; storageKey: string }>;
  photoSceneSources?: Array<{ videoSceneId: string; storageKey: string }>;
  generatedImageSceneSources?: Array<{ videoSceneId: string; storageKey: string }>;
  backgroundAudioSource?: { storageKey: string; volumePercent: number };
}

export interface VideoSceneRenderSourcePort {
  createUrl(storageKey: string): Promise<string>;
}

export interface VideoRenderProviderPort {
  submit(input: {
    renderId: string;
    project: VideoProjectRecord;
    aiSceneSources: Array<{ videoSceneId: string; url: string }>;
    photoSceneSources?: Array<{ videoSceneId: string; url: string }>;
    generatedImageSceneSources?: Array<{ videoSceneId: string; url: string }>;
    narrationUrl?: string;
    backgroundAudioUrl?: string;
    backgroundAudioVolumePercent?: number;
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
    durationSeconds: VideoDurationSeconds;
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
