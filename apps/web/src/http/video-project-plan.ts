import 'server-only';
import { ApproveVideoPlan, GenerateVideoPlan } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { recordOpenAiUsageAndSettle } from '../ai/openai-cost-admission';
import {
  reserveOpenAiRuntimeConfiguration,
  type AdmittedOpenAiRuntimeConfiguration,
} from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
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
  let usagePersistenceStarted = false;
  let runtime: AdmittedOpenAiRuntimeConfiguration | undefined;
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
    const operationKey = `video-plan:${videoProjectId}:revision:${expectedRevision}`;
    const admittedRuntime = await reserveOpenAiRuntimeConfiguration(operationKey);
    runtime = admittedRuntime;
    model = admittedRuntime.model;
    const generated = await withOrganizationAiGenerationQuota({
      workspaceId,
      operationKey,
      generate: () => {
        providerAttempted = true;
        return new GenerateVideoPlan(
          projects,
          new db.PrismaVideoPlanningContextRepository(),
          new OpenAIVideoPlanGenerator({
            apiKey: admittedRuntime.apiKey,
            model: admittedRuntime.model,
          }),
        ).execute({
          workspaceId,
          groupId,
          actorUserId: actor.userId,
          videoProjectId,
          expectedRevision,
        });
      },
    });
    usagePersistenceStarted = true;
    await recordOpenAiUsageAndSettle(admittedRuntime, {
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
      estimatedCostUsdMicros: admittedRuntime.requestCostUsdMicros,
      pricingVersion: 'admin-request-cost-v1',
      idempotencyKey: operationKey,
    });
    return Response.json(
      { data: publicVideoProject(generated.project), requestId },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (runtime && !usagePersistenceStarted && actorUserId && bunshinId) {
      usagePersistenceStarted = true;
      await recordOpenAiUsageAndSettle(runtime, {
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
        estimatedCostUsdMicros: providerAttempted ? runtime.requestCostUsdMicros : 0,
        pricingVersion: 'admin-request-cost-v1',
        idempotencyKey: `video-plan:${videoProjectId}:revision:${expectedRevision}`,
      });
    }
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
