import 'server-only';
import {
  ExecuteVideoRenderStep,
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

export function createVideoRenderJobHandler(): VideoRenderJobHandler {
  return {
    async execute(input) {
      try {
        const configuration = await resolveCreatomateRuntimeConfiguration();
        const db = await import('@bunshin/database');
        return await new ExecuteVideoRenderStep(
          new db.PrismaVideoRenderRepository(),
          new CreatomateVideoRenderAdapter(configuration.apiKey),
          new SupabaseVideoRenderOutputStorage(),
        ).execute(input);
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
