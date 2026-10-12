import 'server-only';
import {
  UpdateVideoNarrationSettings,
  VIDEO_NARRATION_SPEEDS,
  VIDEO_NARRATION_VOICES,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import {
  NARRATION_MICROS_PER_CHARACTER,
  NARRATION_MODEL,
  NARRATION_VERSION,
  OpenAIVideoNarration,
  OpenAIVideoNarrationError,
  narrationCharacters,
} from '../providers/openai-video-narration';

const uuid = z.string().uuid();
const selection = z.object({
  voice: z.enum(VIDEO_NARRATION_VOICES),
  speed: z.enum(VIDEO_NARRATION_SPEEDS),
});
const settingsSchema = selection.extend({ expectedRevision: z.number().int().positive() }).strict();
const previewSchema = selection.extend({ previewRequestId: z.string().uuid() }).strict();

async function context(workspaceId: string, groupId: string, videoProjectId: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const [safeWorkspaceId, safeGroupId, safeProjectId] = await Promise.all([
    uuid.parseAsync(workspaceId),
    uuid.parseAsync(groupId),
    uuid.parseAsync(videoProjectId),
  ]);
  const db = await import('@bunshin/database');
  const project = await new db.PrismaVideoProjectRepository().findOwned({
    workspaceId: safeWorkspaceId,
    groupId: safeGroupId,
    actorUserId: actor.userId,
    videoProjectId: safeProjectId,
  });
  if (!project) throw new ApplicationError('NOT_FOUND', 'video project not found');
  if (!project.narrationEnabled || project.status !== 'WAITING_APPROVAL' || !project.scenes[0])
    throw new ApplicationError('CONFLICT', 'narration settings are unavailable');
  return {
    actor,
    db,
    project,
    firstScene: project.scenes[0],
    safeWorkspaceId,
    safeGroupId,
    safeProjectId,
  };
}

export async function updateVideoNarrationSettingsResponse(
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
    const input = settingsSchema.parse(await request.json());
    const value = await context(workspaceId, groupId, videoProjectId);
    const updated = await new UpdateVideoNarrationSettings(
      new value.db.PrismaVideoProjectRepository(),
    ).execute({
      workspaceId: value.safeWorkspaceId,
      groupId: value.safeGroupId,
      actorUserId: value.actor.userId,
      videoProjectId: value.safeProjectId,
      expectedRevision: input.expectedRevision,
      voice: input.voice,
      speed: input.speed,
    });
    return Response.json(
      { data: { id: updated.id, revision: updated.revision }, requestId },
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

export async function previewVideoProjectNarrationResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  videoProjectId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  let usage:
    { workspaceId: string; bunshinId: string; actorUserId: string; key: string } | undefined;
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const input = previewSchema.parse(await request.json());
    const value = await context(workspaceId, groupId, videoProjectId);
    const narration = value.firstScene.narration.trim();
    const operationKey = `video-project-narration-preview:${value.project.id}:${value.actor.userId}:${input.previewRequestId}`;
    usage = {
      workspaceId: value.safeWorkspaceId,
      bunshinId: value.project.bunshinId,
      actorUserId: value.actor.userId,
      key: operationKey,
    };
    const runtime = await resolveOpenAiRuntimeConfiguration();
    const audio = await withOrganizationAiGenerationQuota({
      workspaceId: value.safeWorkspaceId,
      groupId: value.safeGroupId,
      operationKey,
      generate: () =>
        new OpenAIVideoNarration(runtime.apiKey).preview(input.voice, input.speed, narration),
    });
    await recordAiUsageSafely({
      workspaceId: value.safeWorkspaceId,
      bunshinId: value.project.bunshinId,
      actorUserId: value.actor.userId,
      taskType: 'VIDEO_NARRATION_PREVIEW',
      provider: 'OPENAI',
      model: NARRATION_MODEL,
      promptVersion: NARRATION_VERSION,
      status: 'SUCCESS',
      inputTokens: null,
      outputTokens: null,
      latencyMs: Date.now() - started,
      estimatedCostUsdMicros: narrationCharacters(narration) * NARRATION_MICROS_PER_CHARACTER,
      pricingVersion: 'gpt-4o-mini-tts-character-estimate-2026-09-13',
      idempotencyKey: operationKey,
    });
    return new Response(new Uint8Array(audio), {
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'private, no-store',
        'x-request-id': requestId,
      },
    });
  } catch (error) {
    const normalized =
      error instanceof OpenAIVideoNarrationError
        ? new ApplicationError(
            'AI_PROVIDER_UNAVAILABLE',
            '音声を作れませんでした。少し待ってからもう一度お試しください。',
          )
        : error;
    if (usage)
      await recordAiUsageSafely({
        workspaceId: usage.workspaceId,
        bunshinId: usage.bunshinId,
        actorUserId: usage.actorUserId,
        taskType: 'VIDEO_NARRATION_PREVIEW',
        provider: 'OPENAI',
        model: NARRATION_MODEL,
        promptVersion: NARRATION_VERSION,
        status: 'FAILED',
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        idempotencyKey: usage.key,
        errorCode:
          error instanceof OpenAIVideoNarrationError
            ? `VIDEO_NARRATION_${error.category}`
            : 'VIDEO_NARRATION_PREVIEW_FAILED',
      });
    const mapped = toApiError(normalized, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
