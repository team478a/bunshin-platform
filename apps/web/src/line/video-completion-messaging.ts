import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  VideoCompletionMessagingPort,
  VideoRenderCompletionContext,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { LineMessagingApiAdapter } from './messaging-provider';
import { SupabaseVideoRenderOutputStorage } from '../video/video-render-output-storage';

const snapshotSchema = z
  .object({
    recipientId: z.string(),
    credentialFingerprint: z.string(),
    projectTitle: z.string(),
    reviewUrl: z.string(),
    retryKey: z.string().uuid(),
    video: z.object({ originalContentUrl: z.string(), previewImageUrl: z.string() }).optional(),
  })
  .strict();

/** Freeze the payload before the first external send, including during concurrent retries. */
export function videoCompletionMessaging(
  context: VideoRenderCompletionContext,
  loadDatabase = () => import('@bunshin/database'),
): VideoCompletionMessagingPort {
  const messaging = new LineMessagingApiAdapter();
  return {
    getQuota: (token) => messaging.getQuota(token),
    async pushVideoCompletion(input) {
      const db = await loadDatabase();
      const where = {
        id: context.renderId,
        workspaceId: context.workspaceId,
        groupId: context.groupId,
        ownerUserId: context.ownerUserId,
        videoProjectId: context.videoProjectId,
        status: 'SUCCEEDED' as const,
        deletedAt: null,
        project: {
          bunshinId: context.bunshinId,
          ownerUserId: context.ownerUserId,
          status: { not: 'CANCELLED' as const },
        },
      };
      const render = await db.prisma.videoRender.findFirst({ where });
      if (!render?.outputStorageKey || (render.expiresAt && render.expiresAt <= new Date()))
        throw new ApplicationError('FORBIDDEN', 'completed video unavailable');
      const credentialFingerprint = createHash('sha256').update(input.accessToken).digest('hex');
      let stored = render.notificationSnapshot;
      if (!stored) {
        const expectedKey = `${context.workspaceId}/${context.ownerUserId}/${context.renderId}.mp4`;
        if (render.outputStorageKey !== expectedKey)
          throw new ApplicationError('FORBIDDEN', 'video storage scope mismatch');
        // Retried legacy messages keep their original text-only shape.
        const attach =
          context.notificationAttemptCount === 0 &&
          (!render.expiresAt || render.expiresAt.getTime() > Date.now() + 24 * 60 * 60 * 1000);
        const preview = new URL('/api/media/video-cover', input.reviewUrl).toString();
        const snapshot = {
          recipientId: input.recipientId,
          credentialFingerprint,
          projectTitle: input.projectTitle,
          reviewUrl: input.reviewUrl,
          retryKey: input.retryKey,
          ...(attach
            ? {
                video: {
                  originalContentUrl:
                    await new SupabaseVideoRenderOutputStorage().createLineDeliveryUrl(expectedKey),
                  previewImageUrl: preview,
                },
              }
            : {}),
        };
        await db.prisma.videoRender.updateMany({
          where: { ...where, notificationSnapshot: null },
          data: { notificationSnapshot: JSON.stringify(snapshot) },
        });
        stored = (await db.prisma.videoRender.findFirst({ where }))?.notificationSnapshot ?? null;
      }
      if (!stored) throw new ApplicationError('CONFLICT', 'video notification unavailable');
      const snapshot = snapshotSchema.parse(JSON.parse(stored));
      if (
        snapshot.recipientId !== input.recipientId ||
        snapshot.credentialFingerprint !== credentialFingerprint ||
        snapshot.retryKey !== input.retryKey
      )
        throw new ApplicationError('FORBIDDEN', 'video notification destination changed');
      return messaging.pushVideoCompletion({
        accessToken: input.accessToken,
        recipientId: snapshot.recipientId,
        projectTitle: snapshot.projectTitle,
        reviewUrl: snapshot.reviewUrl,
        retryKey: snapshot.retryKey,
        ...(snapshot.video ? { video: snapshot.video } : {}),
      });
    },
  };
}
