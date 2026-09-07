import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { VideoRenderJobHandlerError, type VideoProjectRecord } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  composeNarration,
  validateNarrationScenes,
  narrationCharacters,
  NARRATION_MODEL,
  NARRATION_VOICE,
  NARRATION_VERSION,
  NARRATION_MICROS_PER_CHARACTER,
  OpenAIVideoNarration,
  OpenAIVideoNarrationError,
} from '../providers/openai-video-narration';
import { SupabaseVideoNarrationStorage } from './video-narration-storage';

const maxAttempts = 3;

export async function prepareVideoNarration(
  project: VideoProjectRecord,
  renderId: string,
): Promise<string | undefined> {
  if (!project.narrationEnabled) return undefined;
  validateNarrationScenes(project.scenes);
  const db = await import('@bunshin/database');
  const scope = {
    workspaceId: project.workspaceId,
    groupId: project.groupId,
    ownerUserId: project.ownerUserId,
  };
  const where = {
    id: renderId,
    ...scope,
    status: 'QUEUED' as const,
    project: {
      id: project.id,
      revision: project.revision,
      status: { not: 'CANCELLED' as const },
      ownerUser: { status: 'ACTIVE' as const },
      groupMembership: { status: 'ACTIVE' as const },
    },
  };
  const assertActive = async () => {
    if (!(await db.prisma.videoRender.findFirst({ where, select: { id: true } })))
      throw new VideoRenderJobHandlerError('VIDEO_NARRATION_SCOPE_UNAVAILABLE', false);
  };
  await assertActive();
  const textHash = createHash('sha256')
    .update(
      JSON.stringify([
        NARRATION_VERSION,
        project.scenes.map((scene) => [scene.id, scene.narration.trim(), scene.durationMs]),
      ]),
    )
    .digest('hex');
  const storage = new SupabaseVideoNarrationStorage();
  const existing = await db.prisma.videoNarration.findUnique({ where: { renderId } });
  if (
    existing &&
    (existing.workspaceId !== scope.workspaceId ||
      existing.groupId !== scope.groupId ||
      existing.ownerUserId !== scope.ownerUserId ||
      existing.textHash !== textHash)
  )
    throw new VideoRenderJobHandlerError('VIDEO_NARRATION_SNAPSHOT_MISMATCH', false);
  if (
    existing?.status === 'READY' &&
    existing.storageKey &&
    !existing.deletedAt &&
    existing.expiresAt > new Date()
  )
    return storage.createUrl(existing.storageKey);
  if (existing?.status === 'PROCESSING' && Date.now() - existing.updatedAt.getTime() < 5 * 60_000)
    throw new VideoRenderJobHandlerError('VIDEO_NARRATION_PENDING', true);
  if (
    existing?.errorCode?.startsWith('NON_RETRYABLE:') ||
    (existing?.attemptCount ?? 0) >= maxAttempts
  )
    throw new VideoRenderJobHandlerError(
      existing?.errorCode?.replace('NON_RETRYABLE:', '') ?? 'VIDEO_NARRATION_ATTEMPTS_EXHAUSTED',
      false,
    );

  const runtime = await resolveOpenAiRuntimeConfiguration();
  const id = existing?.id ?? randomUUID();
  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const claimed = existing
    ? await db.prisma.videoNarration.updateMany({
        where: { id, status: existing.status, updatedAt: existing.updatedAt },
        data: { status: 'PROCESSING', attemptCount, errorCode: null },
      })
    : await db.prisma.videoNarration.createMany({
        data: [
          {
            id,
            renderId,
            ...scope,
            status: 'PROCESSING',
            textHash,
            model: NARRATION_MODEL,
            voice: NARRATION_VOICE,
            promptVersion: NARRATION_VERSION,
            attemptCount,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60_000),
          },
        ],
        skipDuplicates: true,
      });
  if (claimed.count !== 1) throw new VideoRenderJobHandlerError('VIDEO_NARRATION_PENDING', true);

  const started = Date.now();
  let attemptedCharacters = 0;
  let totalAttemptedCharacters = existing?.attemptedCharacters ?? 0;
  const key = `${scope.workspaceId}/${scope.ownerUserId}/${renderId}.wav`;
  const speech = new OpenAIVideoNarration(runtime.apiKey);
  let failure: unknown;
  try {
    await withOrganizationAiGenerationQuota({
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      operationKey: `video-narration:${renderId}:attempt:${attemptCount}`,
      generate: async () => {
        const wav = await composeNarration(project.scenes, async (text, durationMs) => {
          await assertActive();
          const characters = narrationCharacters(text);
          attemptedCharacters += characters;
          totalAttemptedCharacters += characters;
          await db.prisma.videoNarration.update({
            where: { id },
            data: {
              attemptedCharacters: totalAttemptedCharacters,
              estimatedCostUsdMicros: totalAttemptedCharacters * NARRATION_MICROS_PER_CHARACTER,
            },
          });
          return speech.speak(text, durationMs);
        });
        await assertActive();
        await storage.store(key, wav);
      },
    });
  } catch (error) {
    failure = error;
  }

  const latencyMs = Date.now() - started;
  const retryable =
    failure instanceof OpenAIVideoNarrationError
      ? failure.retryable
      : failure instanceof ApplicationError
        ? ['INTERNAL_ERROR', 'DATABASE_UNAVAILABLE', 'AI_PROVIDER_UNAVAILABLE'].includes(
            failure.code,
          )
        : true;
  const failureCode =
    failure instanceof OpenAIVideoNarrationError
      ? `VIDEO_NARRATION_${failure.category}`
      : failure instanceof ApplicationError
        ? `VIDEO_NARRATION_${failure.code}`
        : 'VIDEO_NARRATION_INFRASTRUCTURE';
  await db.prisma.videoNarration.update({
    where: { id },
    data: failure
      ? {
          status: 'FAILED',
          storageKey: null,
          latencyMs,
          errorCode: retryable ? failureCode : `NON_RETRYABLE:${failureCode}`,
        }
      : { status: 'READY', storageKey: key, latencyMs, errorCode: null },
  });
  await recordAiUsageSafely({
    workspaceId: scope.workspaceId,
    bunshinId: project.bunshinId,
    actorUserId: scope.ownerUserId,
    taskType: 'VIDEO_NARRATION',
    provider: 'OPENAI',
    model: NARRATION_MODEL,
    promptVersion: NARRATION_VERSION,
    status: failure ? 'FAILED' : 'SUCCESS',
    inputTokens: null,
    outputTokens: null,
    latencyMs,
    estimatedCostUsdMicros: attemptedCharacters * NARRATION_MICROS_PER_CHARACTER,
    pricingVersion: 'tts-1-characters-2026-09-07',
    idempotencyKey: `video-narration:${renderId}:attempt:${attemptCount}`,
    errorCode: failure ? failureCode : null,
  });
  if (failure)
    throw failure instanceof VideoRenderJobHandlerError
      ? failure
      : new VideoRenderJobHandlerError(failureCode, retryable);
  return storage.createUrl(key);
}
