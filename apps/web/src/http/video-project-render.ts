import 'server-only';
import {
  EnqueueJob,
  QueueVideoRender,
  VIDEO_RENDER_JOB_TYPE,
  type JobEnvironment,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveCreatomateRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { assertPrivateVideoStorageConfiguration } from '../video/video-storage-configuration';
import { videoProjectUuid } from './video-project-http-core';

const renderSchema = z.object({ expectedRevision: z.number().int().positive() }).strict();
const jobEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

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
    assertPrivateVideoStorageConfiguration();
    const db = await import('@bunshin/database');
    const render = await new QueueVideoRender(new db.PrismaVideoRenderRepository()).execute({
      workspaceId: videoProjectUuid.parse(workspaceId),
      groupId: videoProjectUuid.parse(groupId),
      actorUserId: actor.userId,
      videoProjectId: videoProjectUuid.parse(videoProjectId),
      expectedRevision: input.expectedRevision,
      provider: 'CREATOMATE',
    });
    await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
      workspaceId: videoProjectUuid.parse(workspaceId),
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
