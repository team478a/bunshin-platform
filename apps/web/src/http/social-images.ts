import 'server-only';
import {
  CreateSocialImageMediaReadUrl,
  DecideSocialImageMedia,
  GetSocialImageGenerationRequest,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { requireSameOrigin } from '../auth/request-security';
import {
  parseSocialImageJsonBody,
  socialImageActorUserId,
  socialImageRequestDto,
  socialImageUuid,
} from './social-image-http-shared';
import { DailyActionStorage } from '../daily-actions/daily-action-storage';
import { SupabaseSocialImageStorage } from '../social-image-storage';

const decisionSchema = z
  .object({
    mediaId: socialImageUuid,
    decision: z.enum(['ADOPTED', 'REJECTED']),
    reviewReason: z
      .enum([
        'TEXT_HARD_TO_READ',
        'CONTENT_MISMATCH',
        'PHOTO_UNNATURAL',
        'DESIGN_UNAPPEALING',
        'OTHER',
      ])
      .nullable()
      .default(null),
    reviewNote: z.string().trim().max(500).nullable().default(null),
  })
  .strict()
  .refine((value) => value.decision !== 'REJECTED' || value.reviewReason !== null, {
    message: '使わない理由を選んでください。',
    path: ['reviewReason'],
  });
export async function savedSocialPhotoResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  bunshinId: string,
  photoId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await socialImageActorUserId();
    const db = await import('@bunshin/database');
    const photo = await db.prisma.bunshinMemory.findFirst({
      where: {
        id: socialImageUuid.parse(photoId),
        workspaceId: socialImageUuid.parse(workspaceId),
        bunshinId: socialImageUuid.parse(bunshinId),
        sourceType: 'USER_INPUT',
        sourceId: { startsWith: 'daily-action:PHOTO:' },
        attachmentStatus: 'READY',
        attachmentStorageKey: { not: null },
        active: true,
        deletedAt: null,
        bunshin: {
          ownerUserId: actor,
          groupId: socialImageUuid.parse(groupId),
          status: { not: 'ARCHIVED' },
          group: {
            status: 'ACTIVE',
            memberships: {
              some: { userId: actor, status: 'ACTIVE', consentedAt: { not: null } },
            },
          },
        },
      },
      select: { attachmentStorageKey: true },
    });
    if (!photo?.attachmentStorageKey)
      throw new ApplicationError('NOT_FOUND', '保存した写真が見つかりません');
    return new Response(null, {
      status: 302,
      headers: {
        location: await new DailyActionStorage().createReadUrl(photo.attachmentStorageKey),
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export async function getSocialImageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  requestResourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await socialImageActorUserId();
    const db = await import('@bunshin/database');
    const requests = new db.PrismaSocialImageGenerationRequestRepository();
    const value = await new GetSocialImageGenerationRequest(requests).execute({
      workspaceId: socialImageUuid.parse(workspaceId),
      groupId: socialImageUuid.parse(groupId),
      actorUserId: actor,
      requestId: socialImageUuid.parse(requestResourceId),
    });
    const mediaPages = await requests.listMediaOwned({
      workspaceId,
      groupId,
      actorUserId: actor,
      requestId: value.id,
    });
    return Response.json(
      {
        data: {
          ...socialImageRequestDto(value),
          media: mediaPages[0]
            ? {
                id: mediaPages[0].id,
                status: mediaPages[0].status,
                reviewReason: mediaPages[0].reviewReason,
                reviewNote: mediaPages[0].reviewNote,
                width: mediaPages[0].width,
                height: mediaPages[0].height,
                downloadPath: `${new URL(request.url).pathname}/download?mediaId=${mediaPages[0].id}&v=${value.revision}`,
                savePath: `${new URL(request.url).pathname}/download?mediaId=${mediaPages[0].id}&download=1&v=${value.revision}`,
              }
            : null,
          mediaPages: mediaPages.map((media) => ({
            id: media.id,
            pageIndex: media.pageIndex,
            status: media.status,
            reviewReason: media.reviewReason,
            reviewNote: media.reviewNote,
            width: media.width,
            height: media.height,
            downloadPath: `${new URL(request.url).pathname}/download?mediaId=${media.id}&v=${value.revision}`,
            savePath: `${new URL(request.url).pathname}/download?mediaId=${media.id}&download=1&v=${value.revision}`,
          })),
        },
        requestId,
      },
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

export async function decideSocialImageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  requestResourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await socialImageActorUserId();
    const parsed = decisionSchema.parse(await parseSocialImageJsonBody(request));
    const db = await import('@bunshin/database');
    const value = await new DecideSocialImageMedia(
      new db.PrismaSocialImageGenerationRequestRepository(),
    ).execute({
      workspaceId: socialImageUuid.parse(workspaceId),
      groupId: socialImageUuid.parse(groupId),
      actorUserId: actor,
      requestId: socialImageUuid.parse(requestResourceId),
      mediaId: parsed.mediaId,
      decision: parsed.decision,
      reviewReason: parsed.reviewReason,
      reviewNote: parsed.reviewNote,
    });
    return Response.json(
      { data: { id: value.id, status: value.status }, requestId },
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

export async function downloadSocialImageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  requestResourceId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await socialImageActorUserId();
    const db = await import('@bunshin/database');
    const requests = new db.PrismaSocialImageGenerationRequestRepository();
    const mediaPages = await requests.listMediaOwned({
      workspaceId: socialImageUuid.parse(workspaceId),
      groupId: socialImageUuid.parse(groupId),
      actorUserId: actor,
      requestId: socialImageUuid.parse(requestResourceId),
    });
    const requestedMediaId = new URL(request.url).searchParams.get('mediaId');
    const shouldDownload = new URL(request.url).searchParams.get('download') === '1';
    const media = requestedMediaId
      ? mediaPages.find((item) => item.id === socialImageUuid.parse(requestedMediaId))
      : mediaPages[0];
    if (!media) throw new ApplicationError('NOT_FOUND', 'social image not found');
    const signed = await new CreateSocialImageMediaReadUrl(
      requests,
      new SupabaseSocialImageStorage(),
    ).execute({
      workspaceId,
      groupId,
      actorUserId: actor,
      requestId: requestResourceId,
      mediaId: media.id,
      kind: 'COMPLETED',
      ...(shouldDownload
        ? { downloadFilename: `watashi-works-post-${media.pageIndex + 1}.png` }
        : {}),
    });
    return new Response(null, {
      status: 302,
      headers: {
        location: signed.url,
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="watashi-works-social-image.png"',
      },
    });
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}

export { createCarouselVideoResponse } from './social-image-carousel-video';

export { createSocialImageResponse } from './social-image-generation';
