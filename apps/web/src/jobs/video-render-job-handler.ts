import 'server-only';
import {
  ExecuteVideoRenderStep,
  FinalizeVideoRenderCompletion,
  SendVideoCompletionNotification,
  VideoRenderJobHandlerError,
  type VideoRenderJobHandler,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { resolveCreatomateRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import {
  CreatomateVideoRenderAdapter,
  VideoRenderProviderError,
} from '../providers/creatomate-video-render';
import { SupabaseVideoRenderOutputStorage } from '../video/video-render-output-storage';
import { HkdfVideoRenderWebhookSigner } from '../video/video-render-webhook-signer';
import { ActiveLineDeliveryConfigurationAdapter } from '../line/delivery-configuration';
import { LineMessagingApiAdapter } from '../line/messaging-provider';
import { currentLineEnvironment, lineEndpointUrls } from '../line/secure-configuration';

const tokyoLocalDate = (value: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

export function createVideoRenderJobHandler(): VideoRenderJobHandler {
  return {
    async execute(input) {
      try {
        const configuration = await resolveCreatomateRuntimeConfiguration();
        const db = await import('@bunshin/database');
        const result = await new ExecuteVideoRenderStep(
          new db.PrismaVideoRenderRepository(),
          new CreatomateVideoRenderAdapter(configuration.apiKey),
          new SupabaseVideoRenderOutputStorage(),
          new HkdfVideoRenderWebhookSigner(),
        ).execute(input);
        if (result.status !== 'SUCCEEDED') return result;
        const completedAt = result.render.completedAt ?? new Date();
        const environment = currentLineEnvironment();
        const completions = new db.PrismaVideoRenderCompletionRepository();
        const context = await new FinalizeVideoRenderCompletion(completions).execute({
          environment,
          workspaceId: input.workspaceId,
          renderId: input.renderId,
          localDate: tokyoLocalDate(completedAt),
          completedAt,
        });
        const base = new URL(lineEndpointUrls().missionDeepLinkBaseUrl);
        base.pathname = `/groups/${context.groupId}/videos/${context.videoProjectId}`;
        base.search = '';
        const notification = await new SendVideoCompletionNotification(
          completions,
          new ActiveLineDeliveryConfigurationAdapter(),
          new db.PrismaLineConnectionRepository(),
          new db.PrismaLineDeliveryPreferenceRepository(),
          new LineMessagingApiAdapter(),
        ).execute({ context, environment, reviewUrl: base.toString() });
        if (!notification.sent && notification.retryable)
          throw new VideoRenderJobHandlerError(
            `VIDEO_COMPLETION_${notification.errorCode ?? 'NOTIFICATION_FAILED'}`,
            true,
          );
        return result;
      } catch (error) {
        if (error instanceof VideoRenderProviderError)
          throw new VideoRenderJobHandlerError(`CREATOMATE_${error.category}`, error.retryable);
        if (error instanceof ApplicationError) throw error;
        throw new VideoRenderJobHandlerError('VIDEO_RENDER_INFRASTRUCTURE', true);
      }
    },
    async markFailed(input) {
      const db = await import('@bunshin/database');
      await new db.PrismaVideoRenderRepository().markFailed(input);
    },
  };
}
