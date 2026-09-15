import 'server-only';
import {
  ExecuteVideoSceneGenerationStep,
  VideoAiSceneGenerationJobHandlerError,
  type VideoAiSceneGenerationJobHandler,
  type VideoSceneReferenceUrlPort,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { resolveVideoAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { AiCharacterReferenceStorage } from '../ai-character-reference-storage';
import { FalKlingVideoAdapter, FalKlingVideoProviderError } from '../providers/fal-kling-video';
import { RunwayVideoAdapter, RunwayVideoProviderError } from '../providers/runway-video';
import { SupabaseFalVideoSceneOutputStorage } from '../video/fal-video-scene-output-storage';

class PrivateCharacterReferenceUrls implements VideoSceneReferenceUrlPort {
  constructor(private readonly storage = new AiCharacterReferenceStorage()) {}

  async createTemporaryReadUrls(input: { storageKeys: string[] }) {
    if (input.storageKeys.length === 0 || input.storageKeys.length > 7)
      throw new ApplicationError('VALIDATION_ERROR', '画像参照を確認してください');
    return Promise.all(
      input.storageKeys.map(
        async (storageKey) =>
          (await this.storage.createTemporaryReadUrl({ storageKey, expiresInSeconds: 5 * 60 })).url,
      ),
    );
  }
}

export function createVideoAiSceneGenerationJobHandler(): VideoAiSceneGenerationJobHandler {
  return {
    async execute(input) {
      try {
        const db = await import('@bunshin/database');
        const repository = new db.PrismaVideoSceneGenerationRepository();
        const execution = await repository.findForExecution(input);
        if (!execution) throw new ApplicationError('NOT_FOUND', 'video scene generation not found');
        if (execution.generation.provider !== 'FAL' && execution.generation.provider !== 'RUNWAY')
          throw new ApplicationError('CONFIGURATION_ERROR', 'unsupported video provider');
        const provider = execution.generation.provider;
        const configuration = await resolveVideoAiRuntimeConfiguration({ provider });
        if (execution?.generation.status === 'QUEUED')
          await new db.PrismaVideoMediaQuotaRepository().reserve(execution.generation);
        const providerAdapter =
          provider === 'RUNWAY'
            ? new RunwayVideoAdapter(configuration.apiKey)
            : new FalKlingVideoAdapter(configuration.apiKey);
        const result = await new ExecuteVideoSceneGenerationStep(
          repository,
          providerAdapter,
          new PrivateCharacterReferenceUrls(),
          new SupabaseFalVideoSceneOutputStorage(),
        ).execute(input);
        if (result.status === 'PENDING')
          return {
            status: result.generation.status === 'SUBMITTED' ? 'SUBMITTED' : 'GENERATING',
          };
        if (result.status === 'SUCCEEDED') return { status: 'SUCCEEDED' };
        return result.generation.errorCode
          ? { status: 'FAILED', errorCode: result.generation.errorCode }
          : { status: 'FAILED' };
      } catch (error) {
        if (error instanceof FalKlingVideoProviderError)
          throw new VideoAiSceneGenerationJobHandlerError(`FAL_${error.category}`, error.retryable);
        if (error instanceof RunwayVideoProviderError)
          throw new VideoAiSceneGenerationJobHandlerError(
            `RUNWAY_${error.category}`,
            error.retryable,
          );
        if (error instanceof ApplicationError) throw error;
        throw new VideoAiSceneGenerationJobHandlerError('VIDEO_AI_SCENE_INFRASTRUCTURE', true);
      }
    },
    async markFailed(input) {
      const db = await import('@bunshin/database');
      await new db.PrismaVideoSceneGenerationRepository().markFailed(input);
    },
  };
}
