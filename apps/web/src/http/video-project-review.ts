import 'server-only';
import { ReviewFinishedVideo, UpdateVideoSceneDraft } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { publicVideoProject, videoProjectUuid } from './video-project-http-core';

const reviewSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    action: z.enum(['ADOPT', 'REVISE']),
    reviewReason: z
      .enum([
        'NARRATION_HARD_TO_HEAR',
        'AI_VOICE_UNNATURAL',
        'CONTENT_MISMATCH',
        'VISUAL_UNNATURAL',
        'TOO_LONG',
        'OTHER',
      ])
      .nullable()
      .default(null),
    reviewNote: z.string().trim().max(500).nullable().default(null),
  })
  .strict()
  .refine((value) => value.action !== 'REVISE' || value.reviewReason !== null, {
    message: '作り直す理由を選んでください。',
    path: ['reviewReason'],
  });
const updateSceneSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    narration: z.string().trim().min(1).max(2_000),
    caption: z.string().trim().min(1).max(240),
  })
  .strict();

export async function reviewFinishedVideoResponse(
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
    const input = reviewSchema.parse(await request.json());
    const db = await import('@bunshin/database');
    const project = await new ReviewFinishedVideo(new db.PrismaVideoProjectRepository()).execute({
      workspaceId: videoProjectUuid.parse(workspaceId),
      groupId: videoProjectUuid.parse(groupId),
      actorUserId: actor.userId,
      videoProjectId: videoProjectUuid.parse(videoProjectId),
      ...input,
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

export async function updateVideoSceneDraftResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  videoProjectId: string,
  sceneId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = updateSceneSchema.parse(await request.json());
    const db = await import('@bunshin/database');
    const project = await new UpdateVideoSceneDraft(new db.PrismaVideoProjectRepository()).execute({
      workspaceId: videoProjectUuid.parse(workspaceId),
      groupId: videoProjectUuid.parse(groupId),
      actorUserId: actor.userId,
      videoProjectId: videoProjectUuid.parse(videoProjectId),
      sceneId: videoProjectUuid.parse(sceneId),
      ...input,
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
