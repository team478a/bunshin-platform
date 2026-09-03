import 'server-only';
import {
  ApproveVideoPlan,
  AuthorizeVideoAiGenerationCost,
  CreateVideoProject,
  EnqueueJob,
  GenerateVideoPlan,
  QueueVideoRender,
  QueueVideoSceneGenerations,
  ResolveVideoDisclosurePolicy,
  VIDEO_AI_SCENE_GENERATION_JOB_TYPE,
  VIDEO_RENDER_JOB_TYPE,
  isAiVideoScene,
  type JobEnvironment,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import {
  resolveCreatomateRuntimeConfiguration,
  resolveOpenAiRuntimeConfiguration,
  resolveVideoAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { assertOrganizationGenerationQuota } from '../organization-generation-quota';
import { currentLineEnvironment } from '../line/secure-configuration';
import {
  OpenAIVideoPlanGenerator,
  VIDEO_PLAN_PROMPT_VERSION,
} from '../providers/openai-video-plan-generator';

const uuid = z.string().uuid();
const createSchema = z
  .object({
    groupMembershipId: z.uuid(),
    bunshinId: z.uuid(),
    campaignId: z.uuid().nullable().optional(),
    characterProfileVersionId: z.uuid().nullable().optional(),
    title: z.string().trim().min(1).max(160),
    platform: z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE_SHORTS']),
    type: z.enum(['EXPLAINER', 'PRODUCT_INTRODUCTION', 'PHOTO_SLIDESHOW']),
    durationSeconds: z.union([z.literal(30), z.literal(60)]),
    compositionMode: z.enum(['STANDARD', 'AI_SCENES']).default('STANDARD'),
  })
  .strict();
const generateSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
const approveSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
const renderSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
const queueAiScenesSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    provider: z.literal('FAL'),
  })
  .strict();
const jobEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

function publicProject<
  T extends {
    id: string;
    title: string;
    platform: string;
    type: string;
    durationSeconds: number;
    status: string;
    revision: number;
    aiProcessingTypes: unknown;
    standardComposition: boolean;
    scenes: unknown;
    disclosureSnapshot: unknown;
  },
>(project: T) {
  return {
    id: project.id,
    title: project.title,
    platform: project.platform,
    type: project.type,
    durationSeconds: project.durationSeconds,
    status: project.status,
    revision: project.revision,
    aiProcessingTypes: project.aiProcessingTypes,
    standardComposition: project.standardComposition,
    scenes: project.scenes,
    disclosureSnapshot: project.disclosureSnapshot,
  };
}

export async function createVideoProjectResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = createSchema.parse(await request.json());
    if (input.compositionMode === 'AI_SCENES' && !input.characterProfileVersionId)
      throw new ApplicationError('VALIDATION_ERROR', 'AI動画ではAIキャラクターを選んでください');
    const db = await import('@bunshin/database');
    const disclosure = await new ResolveVideoDisclosurePolicy(
      new db.PrismaVideoDisclosurePolicyRepository(),
    ).execute({ environment: currentLineEnvironment(), platform: input.platform });
    const project = await new CreateVideoProject(new db.PrismaVideoProjectRepository()).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      groupMembershipId: input.groupMembershipId,
      actorUserId: actor.userId,
      bunshinId: input.bunshinId,
      campaignId: input.campaignId ?? null,
      characterProfileVersionId: input.characterProfileVersionId ?? null,
      title: input.title,
      platform: input.platform,
      type: input.type,
      durationSeconds: input.durationSeconds,
      standardComposition: input.compositionMode === 'STANDARD',
      aiProcessingTypes: [],
      disclosureSnapshot: {
        schemaVersion: 1,
        source: 'ACTIVE_POLICY',
        environment: currentLineEnvironment(),
        policyId: disclosure.policyId,
        policyVersion: disclosure.policyVersion,
        platform: disclosure.platform,
        disclosureText: disclosure.disclosureText,
        hashtags: disclosure.hashtags,
        guidance: disclosure.guidance,
        outputMetadata: disclosure.outputMetadata,
        resolvedAt: disclosure.resolvedAt.toISOString(),
        standardComposition: input.compositionMode === 'STANDARD',
        aiVideoGeneration: input.compositionMode === 'AI_SCENES',
        explanation:
          input.compositionMode === 'AI_SCENES'
            ? 'AIが台本とAI動画用の場面を提案します。外部生成は承認後に、設定と予算を確認して開始します。'
            : 'AIが台本と素材候補を提案します。標準動画ではAI動画生成を使いません。',
      },
    });
    return Response.json(
      { data: publicProject(project), requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function generateVideoPlanResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  videoProjectId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  let actorUserId: string | null = null;
  let bunshinId: string | null = null;
  let model = 'unknown';
  let providerAttempted = false;
  const started = Date.now();
  let expectedRevision = 0;
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    actorUserId = actor.userId;
    expectedRevision = generateSchema.parse(await request.json()).expectedRevision;
    const db = await import('@bunshin/database');
    const projects = new db.PrismaVideoProjectRepository();
    const scoped = await projects.findOwned({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId,
      videoProjectId: uuid.parse(videoProjectId),
    });
    if (!scoped) throw new ApplicationError('NOT_FOUND', 'video project not found');
    if (scoped.revision !== expectedRevision)
      throw new ApplicationError('CONFLICT', 'video project revision conflict');
    bunshinId = scoped.bunshinId;
    const runtime = await resolveOpenAiRuntimeConfiguration();
    model = runtime.model;
    providerAttempted = true;
    const generated = await new GenerateVideoPlan(
      projects,
      new db.PrismaVideoPlanningContextRepository(),
      new OpenAIVideoPlanGenerator({ apiKey: runtime.apiKey, model: runtime.model }),
    ).execute({
      workspaceId,
      groupId,
      actorUserId,
      videoProjectId,
      expectedRevision,
    });
    await recordAiUsageSafely({
      workspaceId,
      bunshinId,
      actorUserId,
      taskType: 'VIDEO_PLAN_GENERATOR',
      provider: 'openai',
      model: generated.generation.model,
      promptVersion: generated.generation.promptVersion,
      status: 'SUCCESS',
      inputTokens: generated.generation.inputTokens,
      outputTokens: generated.generation.outputTokens,
      latencyMs: generated.generation.latencyMs,
      idempotencyKey: `video-plan:${videoProjectId}:revision:${expectedRevision}`,
    });
    return Response.json(
      { data: publicProject(generated.project), requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (providerAttempted && actorUserId && bunshinId)
      await recordAiUsageSafely({
        workspaceId,
        bunshinId,
        actorUserId,
        taskType: 'VIDEO_PLAN_GENERATOR',
        provider: 'openai',
        model,
        promptVersion: VIDEO_PLAN_PROMPT_VERSION,
        status: 'FAILED',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        errorCode: error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR',
        idempotencyKey: `video-plan:${videoProjectId}:revision:${expectedRevision}:failed`,
      });
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function approveVideoPlanResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  videoProjectId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = approveSchema.parse(await request.json());
    const db = await import('@bunshin/database');
    const project = await new ApproveVideoPlan(new db.PrismaVideoProjectRepository()).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor.userId,
      videoProjectId: uuid.parse(videoProjectId),
      expectedRevision: input.expectedRevision,
    });
    return Response.json(
      { data: publicProject(project), requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function queueVideoRenderResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  videoProjectId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = renderSchema.parse(await request.json());
    await resolveCreatomateRuntimeConfiguration();
    const db = await import('@bunshin/database');
    const render = await new QueueVideoRender(new db.PrismaVideoRenderRepository()).execute({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor.userId,
      videoProjectId: uuid.parse(videoProjectId),
      expectedRevision: input.expectedRevision,
      provider: 'CREATOMATE',
    });
    await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
      workspaceId: uuid.parse(workspaceId),
      correlationId: requestId,
      requestedBy: actor.userId,
      environment: jobEnvironment[getServerEnvironment().APP_ENV],
      jobType: VIDEO_RENDER_JOB_TYPE,
      payloadReference: `video-render:${render.id}`,
      idempotencyKey: `video-render:${render.id}`,
      priority: 40,
      maxAttempts: 12,
    });
    return Response.json(
      { data: { id: render.id, status: render.status }, requestId },
      { status: 202, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

/**
 * Records one independently auditable request per AI-video scene. The external provider is
 * intentionally not invoked here: a dedicated worker will submit only these approved records.
 */
export async function queueVideoAiScenesResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  videoProjectId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = queueAiScenesSchema.parse(await request.json());
    const parsedWorkspaceId = uuid.parse(workspaceId);
    const parsedGroupId = uuid.parse(groupId);
    const parsedVideoProjectId = uuid.parse(videoProjectId);
    const db = await import('@bunshin/database');
    const projects = new db.PrismaVideoProjectRepository();
    const project = await projects.findOwned({
      workspaceId: parsedWorkspaceId,
      groupId: parsedGroupId,
      actorUserId: actor.userId,
      videoProjectId: parsedVideoProjectId,
    });
    if (!project) throw new ApplicationError('NOT_FOUND', 'video project not found');
    if (project.revision !== input.expectedRevision)
      throw new ApplicationError('CONFLICT', 'video project revision conflict');
    await assertOrganizationGenerationQuota({
      workspaceId: parsedWorkspaceId,
      kind: 'VIDEO',
      resourceId: parsedVideoProjectId,
    });
    const runtime = await resolveVideoAiRuntimeConfiguration({ provider: input.provider });
    const estimatedSceneCostsUsdMicros = project.scenes
      .filter(isAiVideoScene)
      .map((scene) =>
        Math.round((scene.durationMs / 1_000) * runtime.estimatedCostUsdMicrosPerSecond),
      );
    await new AuthorizeVideoAiGenerationCost(
      new db.PrismaVideoAiProviderCostPolicyRepository(),
    ).execute({
      environment: jobEnvironment[getServerEnvironment().APP_ENV],
      provider: runtime.provider,
      model: runtime.model,
      estimatedSceneCostsUsdMicros,
    });
    const generations = await new QueueVideoSceneGenerations(
      new db.PrismaVideoSceneGenerationRepository(),
    ).execute({
      workspaceId: parsedWorkspaceId,
      groupId: parsedGroupId,
      actorUserId: actor.userId,
      videoProjectId: parsedVideoProjectId,
      expectedRevision: input.expectedRevision,
      provider: runtime.provider,
      model: runtime.model,
      estimatedCostUsdMicrosPerSecond: runtime.estimatedCostUsdMicrosPerSecond,
    });
    const dispatcher = new EnqueueJob(new db.PrismaJobRepository());
    await Promise.all(
      generations.map((generation) =>
        dispatcher.enqueue({
          workspaceId: parsedWorkspaceId,
          correlationId: requestId,
          requestedBy: actor.userId,
          environment: jobEnvironment[getServerEnvironment().APP_ENV],
          jobType: VIDEO_AI_SCENE_GENERATION_JOB_TYPE,
          payloadReference: `video-ai-scene:${generation.id}`,
          idempotencyKey: `video-ai-scene:${generation.id}`,
          priority: 40,
          maxAttempts: 12,
        }),
      ),
    );
    return Response.json(
      {
        data: generations.map((generation) => ({ id: generation.id, status: generation.status })),
        requestId,
      },
      { status: 202, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
