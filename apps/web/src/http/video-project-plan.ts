import 'server-only';
import { ApproveVideoPlan, GenerateVideoPlan } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  OpenAIVideoPlanGenerator,
  VIDEO_PLAN_PROMPT_VERSION,
} from '../providers/openai-video-plan-generator';
import { publicVideoProject, videoProjectUuid } from './video-project-http-core';

const generateSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
const approveSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();

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
      workspaceId: videoProjectUuid.parse(workspaceId),
      groupId: videoProjectUuid.parse(groupId),
      actorUserId,
      videoProjectId: videoProjectUuid.parse(videoProjectId),
    });
    if (!scoped) throw new ApplicationError('NOT_FOUND', 'video project not found');
    if (scoped.revision !== expectedRevision)
      throw new ApplicationError('CONFLICT', 'video project revision conflict');
    bunshinId = scoped.bunshinId;
    const runtime = await resolveOpenAiRuntimeConfiguration();
    model = runtime.model;
    providerAttempted = true;
    const operationKey = `video-plan:${videoProjectId}:revision:${expectedRevision}`;
    const generated = await withOrganizationAiGenerationQuota({
      workspaceId,
      operationKey,
      generate: () =>
        new GenerateVideoPlan(
          projects,
          new db.PrismaVideoPlanningContextRepository(),
          new OpenAIVideoPlanGenerator({ apiKey: runtime.apiKey, model: runtime.model }),
        ).execute({
          workspaceId,
          groupId,
          actorUserId: actor.userId,
          videoProjectId,
          expectedRevision,
        }),
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
      idempotencyKey: operationKey,
    });
    return Response.json(
      { data: publicVideoProject(generated.project), requestId },
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
      workspaceId: videoProjectUuid.parse(workspaceId),
      groupId: videoProjectUuid.parse(groupId),
      actorUserId: actor.userId,
      videoProjectId: videoProjectUuid.parse(videoProjectId),
      expectedRevision: input.expectedRevision,
    });
    return Response.json(
      { data: publicVideoProject(project), requestId },
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
