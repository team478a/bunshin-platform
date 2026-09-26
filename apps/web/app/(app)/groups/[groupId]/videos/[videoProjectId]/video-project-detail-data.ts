import { GetVideoProject } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { isRouteNotFound } from '../../../../../../src/navigation/route-not-found';
import { resolveVideoPostCopy } from '../../../../../../src/video/video-post-copy';

function disclosureGuide(value: Record<string, unknown>) {
  return {
    text: typeof value.disclosureText === 'string' ? value.disclosureText : null,
    hashtags: Array.isArray(value.hashtags)
      ? value.hashtags.filter((item): item is string => typeof item === 'string')
      : [],
    guidance: typeof value.guidance === 'string' ? value.guidance : null,
  };
}

function characterGuide(
  value: Record<string, unknown>,
  referenceAssets: Array<Record<string, unknown>>,
) {
  return {
    name: typeof value.name === 'string' ? value.name : null,
    version: typeof value.version === 'number' ? value.version : null,
    referenceCount: referenceAssets.length,
  };
}

export async function loadVideoProjectDetailPageData(
  values: { groupId: string; videoProjectId: string },
  serviceSlug?: string,
) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse(values.groupId);
  const videoProjectId = z.uuid().safeParse(values.videoProjectId);
  if (!groupId.success || !videoProjectId.success) notFound();

  const db = await import('@bunshin/database');
  const row = await db.prisma.videoProject.findFirst({
    where: { id: videoProjectId.data, groupId: groupId.data, ownerUserId: actor.userId },
    select: {
      workspaceId: true,
      renderAttempts: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!row) notFound();

  let project;
  try {
    project = await new GetVideoProject(new db.PrismaVideoProjectRepository()).execute({
      workspaceId: row.workspaceId,
      groupId: groupId.data,
      actorUserId: actor.userId,
      videoProjectId: videoProjectId.data,
    });
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }

  const sceneGenerations = project.standardComposition
    ? []
    : await db.prisma.videoSceneGeneration.findMany({
        where: {
          workspaceId: project.workspaceId,
          groupId: project.groupId,
          videoProjectId: project.id,
          ownerUserId: actor.userId,
        },
        select: {
          id: true,
          videoSceneId: true,
          status: true,
          errorCode: true,
          outputStorageKey: true,
        },
        orderBy: { createdAt: 'asc' },
      });
  const aiSceneIds = new Set(
    project.scenes
      .filter(
        (scene) =>
          scene.visualType === 'AI_VIDEO' || scene.aiProcessingTypes.includes('VIDEO_GENERATION'),
      )
      .map((scene) => scene.id),
  );
  const completedAiSceneIds = new Set(
    sceneGenerations
      .filter(
        (generation) =>
          generation.status === 'SUCCEEDED' &&
          generation.outputStorageKey &&
          aiSceneIds.has(generation.videoSceneId),
      )
      .map((generation) => generation.videoSceneId),
  );
  const aiSceneGenerationFailed = sceneGenerations.some(
    (generation) => aiSceneIds.has(generation.videoSceneId) && generation.status === 'FAILED',
  );
  const canComposeAiVideo =
    !project.standardComposition &&
    aiSceneIds.size > 0 &&
    completedAiSceneIds.size === aiSceneIds.size &&
    !aiSceneGenerationFailed;

  const renderAttempt = row.renderAttempts[0] ?? null;
  const delivery =
    serviceSlug && renderAttempt?.status === 'SUCCEEDED'
      ? await db.prisma.videoDelivery.findFirst({
          where: {
            workspaceId: project.workspaceId,
            groupId: project.groupId,
            videoProjectId: project.id,
            videoRenderId: renderAttempt.id,
            ownerUserId: actor.userId,
          },
          select: { id: true, status: true, rightsSnapshot: true, expiresAt: true },
        })
      : null;
  const deliveryMessage =
    delivery?.rightsSnapshot &&
    typeof delivery.rightsSnapshot === 'object' &&
    !Array.isArray(delivery.rightsSnapshot) &&
    typeof delivery.rightsSnapshot.usageMessage === 'string'
      ? delivery.rightsSnapshot.usageMessage
      : 'この動画の内容を確認し、ご自身でSNSへ投稿してください。';
  const deliveryStatus =
    delivery?.expiresAt !== null &&
    delivery?.expiresAt !== undefined &&
    delivery.expiresAt <= new Date()
      ? 'EXPIRED'
      : delivery?.status;
  const postCopy = await resolveVideoPostCopy({
    disclosureSnapshot: project.disclosureSnapshot,
    socialImageGenerationRequestId: project.socialImageGenerationRequestId,
    workspaceId: project.workspaceId,
    ownerUserId: project.ownerUserId,
  });

  return {
    project,
    renderAttempt,
    sceneGenerations,
    aiSceneGenerationFailed,
    canComposeAiVideo,
    serviceSlug,
    delivery,
    deliveryMessage,
    deliveryStatus,
    postCopy,
    disclosure: disclosureGuide(project.disclosureSnapshot),
    character: characterGuide(project.characterProfileSnapshot, project.characterReferenceSnapshot),
  };
}

export type VideoProjectDetailPageData = Awaited<ReturnType<typeof loadVideoProjectDetailPageData>>;
