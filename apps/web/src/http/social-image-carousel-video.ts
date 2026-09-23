import 'server-only';
import {
  ApproveVideoPlan,
  CreateVideoProject,
  EnqueueJob,
  GetSocialImageGenerationRequest,
  QueueVideoRender,
  ReplaceVideoPlan,
  ResolveVideoDisclosurePolicy,
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
import { currentLineEnvironment } from '../line/secure-configuration';
import { assertPrivateVideoStorageConfiguration } from '../video/video-storage-configuration';
import { resolveMissionPostCopy } from '../video/video-post-copy';

const uuid = z.string().uuid();
const environment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

async function actorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

export async function createCarouselVideoResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  bunshinId: string,
  dailyMissionId: string,
  requestResourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await actorUserId();
    const scope = {
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      bunshinId: uuid.parse(bunshinId),
      dailyMissionId: uuid.parse(dailyMissionId),
      imageRequestId: uuid.parse(requestResourceId),
    };
    await resolveCreatomateRuntimeConfiguration();
    assertPrivateVideoStorageConfiguration();
    const db = await import('@bunshin/database');
    const imageRequests = new db.PrismaSocialImageGenerationRequestRepository();
    const imageRequest = await new GetSocialImageGenerationRequest(imageRequests).execute({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: actor,
      requestId: scope.imageRequestId,
    });
    if (
      imageRequest.bunshinId !== scope.bunshinId ||
      imageRequest.dailyMissionId !== scope.dailyMissionId ||
      imageRequest.status !== 'READY_FOR_REVIEW'
    )
      throw new ApplicationError('NOT_FOUND', 'social image generation request not found');
    const pages = await imageRequests.listMediaOwned({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      actorUserId: actor,
      requestId: scope.imageRequestId,
    });
    if (
      pages.length !== 5 ||
      pages.some((page, index) => page.pageIndex !== index) ||
      !pages.some((page) => page.status === 'ADOPTED')
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        '「この画像を使う」を押した5枚の投稿画像が必要です。',
      );
    const disclosure = await new ResolveVideoDisclosurePolicy(
      new db.PrismaVideoDisclosurePolicyRepository(),
    ).execute({ environment: currentLineEnvironment(), platform: 'INSTAGRAM' });
    const postCopy = await resolveMissionPostCopy({
      workspaceId: scope.workspaceId,
      bunshinId: scope.bunshinId,
      dailyMissionId: scope.dailyMissionId,
      actorUserId: actor,
    });
    const projects = new db.PrismaVideoProjectRepository();
    let project = await new CreateVideoProject(projects).execute({
      id: scope.imageRequestId,
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      groupMembershipId: imageRequest.groupMembershipId,
      actorUserId: actor,
      bunshinId: scope.bunshinId,
      campaignId: imageRequest.campaignId,
      characterProfileVersionId: null,
      title: '5枚投稿のショート動画',
      platform: 'INSTAGRAM',
      type: 'PHOTO_SLIDESHOW',
      durationSeconds: 25,
      standardComposition: true,
      narrationEnabled: false,
      socialImageGenerationRequestId: scope.imageRequestId,
      aiProcessingTypes: [],
      disclosureSnapshot: {
        schemaVersion: 1,
        source: 'SOCIAL_IMAGE_CAROUSEL',
        imageRequestId: scope.imageRequestId,
        policyId: disclosure.policyId,
        policyVersion: disclosure.policyVersion,
        platform: disclosure.platform,
        disclosureText: disclosure.disclosureText,
        hashtags: disclosure.hashtags,
        guidance: disclosure.guidance,
        outputMetadata: disclosure.outputMetadata,
        resolvedAt: disclosure.resolvedAt.toISOString(),
        ...(postCopy ? { postCopy, postCopySource: 'DAILY_MISSION' } : {}),
      },
    });
    if (project.status === 'DRAFT')
      project = await new ReplaceVideoPlan(projects).execute({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        actorUserId: actor,
        videoProjectId: project.id,
        expectedRevision: project.revision,
        scenes: pages.map((page, index) => ({
          sceneNo: index + 1,
          durationMs: 5_000,
          narration: `${index + 1}枚目`,
          caption: `${index + 1}枚目`,
          visualType: 'GENERATED_IMAGE' as const,
          visualPrompt: null,
          keywords: [page.id],
          aiProcessingTypes: [],
          locked: true,
        })),
        projectAiProcessingTypes: [],
        standardComposition: true,
        aiVideoSceneCount: 0,
      });
    if (project.status === 'WAITING_APPROVAL')
      project = await new ApproveVideoPlan(projects).execute({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        actorUserId: actor,
        videoProjectId: project.id,
        expectedRevision: project.revision,
      });
    let renderId: string | null = null;
    if (project.status === 'APPROVED' || project.status === 'QUEUED') {
      const render = await new QueueVideoRender(new db.PrismaVideoRenderRepository()).execute({
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        actorUserId: actor,
        videoProjectId: project.id,
        expectedRevision: project.revision,
        provider: 'CREATOMATE',
      });
      renderId = render.id;
      await new EnqueueJob(new db.PrismaJobRepository()).enqueue({
        workspaceId: scope.workspaceId,
        bunshinId: scope.bunshinId,
        correlationId: requestId,
        requestedBy: actor,
        environment: environment[getServerEnvironment().APP_ENV],
        jobType: VIDEO_RENDER_JOB_TYPE,
        payloadReference: `video-render:${render.id}`,
        idempotencyKey: `video-render:${render.id}`,
        priority: 40,
        maxAttempts: 12,
      });
    }
    return Response.json(
      { data: { projectId: project.id, renderId, status: project.status }, requestId },
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
