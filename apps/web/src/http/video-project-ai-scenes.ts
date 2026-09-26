import 'server-only';
import {
  AuthorizeVideoAiGenerationCost,
  EnqueueJob,
  QueueVideoSceneGenerations,
  VIDEO_AI_SCENE_GENERATION_JOB_TYPE,
  assertSupportedVideoComposition,
  isAiVideoScene,
  type JobEnvironment,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveVideoAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { assertOrganizationGenerationQuota } from '../organization-generation-quota';
import { videoProjectUuid } from './video-project-http-core';

const queueAiScenesSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    provider: z.enum(['FAL', 'RUNWAY']),
  })
  .strict();
const jobEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

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
    const parsedWorkspaceId = videoProjectUuid.parse(workspaceId);
    const parsedGroupId = videoProjectUuid.parse(groupId);
    const parsedVideoProjectId = videoProjectUuid.parse(videoProjectId);
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
    assertSupportedVideoComposition(project);
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
