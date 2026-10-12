import 'server-only';
import { VIDEO_NARRATION_SPEEDS, VIDEO_NARRATION_VOICES } from '@bunshin/application';
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
  NARRATION_PREVIEW_TEXT,
  NARRATION_VERSION,
  OpenAIVideoNarration,
  OpenAIVideoNarrationError,
  narrationCharacters,
} from '../providers/openai-video-narration';

const pathId = z.string().uuid();
const inputSchema = z
  .object({
    groupMembershipId: z.string().uuid(),
    bunshinId: z.string().uuid(),
    voice: z.enum(VIDEO_NARRATION_VOICES),
    speed: z.enum(VIDEO_NARRATION_SPEEDS),
    previewRequestId: z.string().uuid(),
  })
  .strict();

export async function previewVideoNarrationResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  const started = Date.now();
  let usage:
    | { workspaceId: string; groupId: string; bunshinId: string; actorUserId: string; key: string }
    | undefined;
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [safeWorkspaceId, safeGroupId, input] = await Promise.all([
      pathId.parseAsync(workspaceId),
      pathId.parseAsync(groupId),
      inputSchema.parseAsync(await request.json()),
    ]);
    const db = await import('@bunshin/database');
    const membership = await db.prisma.groupMembership.findFirst({
      where: {
        id: input.groupMembershipId,
        workspaceId: safeWorkspaceId,
        groupId: safeGroupId,
        userId: actor.userId,
        status: 'ACTIVE',
        consentedAt: { not: null },
        group: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) throw new ApplicationError('NOT_FOUND', 'service membership not found');
    const bunshin = await db.prisma.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: safeWorkspaceId,
        ownerUserId: actor.userId,
        status: { not: 'ARCHIVED' },
      },
      select: { id: true },
    });
    if (!bunshin) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    const operationKey = `video-narration-preview:${actor.userId}:${input.previewRequestId}`;
    usage = {
      workspaceId: safeWorkspaceId,
      groupId: safeGroupId,
      bunshinId: bunshin.id,
      actorUserId: actor.userId,
      key: operationKey,
    };
    const runtime = await resolveOpenAiRuntimeConfiguration();
    const audio = await withOrganizationAiGenerationQuota({
      workspaceId: safeWorkspaceId,
      groupId: safeGroupId,
      operationKey,
      generate: () => new OpenAIVideoNarration(runtime.apiKey).preview(input.voice, input.speed),
    });
    await recordAiUsageSafely({
      workspaceId: safeWorkspaceId,
      bunshinId: bunshin.id,
      actorUserId: actor.userId,
      taskType: 'VIDEO_NARRATION_PREVIEW',
      provider: 'OPENAI',
      model: NARRATION_MODEL,
      promptVersion: NARRATION_VERSION,
      status: 'SUCCESS',
      inputTokens: null,
      outputTokens: null,
      latencyMs: Date.now() - started,
      estimatedCostUsdMicros:
        narrationCharacters(NARRATION_PREVIEW_TEXT) * NARRATION_MICROS_PER_CHARACTER,
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
    if (usage) {
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
            : error instanceof ApplicationError
              ? error.code
              : 'VIDEO_NARRATION_PREVIEW_INFRASTRUCTURE',
      });
    }
    const mapped = toApiError(normalized, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
