import 'server-only';
import {
  CreateVideoProject,
  ResolveVideoDisclosurePolicy,
  VIDEO_NARRATION_SPEEDS,
  VIDEO_NARRATION_VOICES,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { currentLineEnvironment } from '../line/secure-configuration';
import { publicVideoProject, videoProjectUuid } from './video-project-http-core';

const createSchema = z
  .object({
    groupMembershipId: z.uuid(),
    photoAssetIds: z.array(z.uuid()).max(5).default([]),
    narrationEnabled: z.boolean().default(false),
    narrationVoice: z.enum(VIDEO_NARRATION_VOICES).default('marin'),
    narrationSpeed: z.enum(VIDEO_NARRATION_SPEEDS).default('STANDARD'),
    bunshinId: z.uuid(),
    campaignId: z.uuid().nullable().optional(),
    characterProfileVersionId: z.uuid().nullable().optional(),
    title: z.string().trim().min(1).max(160),
    platform: z.enum(['INSTAGRAM', 'TIKTOK', 'YOUTUBE_SHORTS']),
    type: z.enum(['EXPLAINER', 'PRODUCT_INTRODUCTION', 'PHOTO_SLIDESHOW']),
    durationSeconds: z.union([z.literal(30), z.literal(60)]),
    compositionMode: z.enum(['STANDARD', 'AI_SCENES']).default('STANDARD'),
  })
  .strict();

export async function createVideoProjectResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const input = createSchema.parse(await request.json());
    if (input.compositionMode === 'AI_SCENES' && !input.characterProfileVersionId)
      throw new ApplicationError('VALIDATION_ERROR', 'AI動画ではAIキャラクターを選んでください');
    const db = await import('@bunshin/database');
    const disclosure = await new ResolveVideoDisclosurePolicy(
      new db.PrismaVideoDisclosurePolicyRepository(),
    ).execute({ environment: currentLineEnvironment(), platform: input.platform });
    const project = await new CreateVideoProject(new db.PrismaVideoProjectRepository()).execute({
      workspaceId: videoProjectUuid.parse(workspaceId),
      groupId: videoProjectUuid.parse(groupId),
      groupMembershipId: input.groupMembershipId,
      actorUserId: actor.userId,
      bunshinId: input.bunshinId,
      campaignId: input.campaignId ?? null,
      characterProfileVersionId: input.characterProfileVersionId ?? null,
      title: input.title,
      photoAssetIds: input.photoAssetIds,
      narrationEnabled: input.narrationEnabled,
      narrationVoice: input.narrationVoice,
      narrationSpeed: input.narrationSpeed,
      platform: input.platform,
      type: input.type,
      durationSeconds: input.durationSeconds,
      standardComposition: input.compositionMode === 'STANDARD',
      aiProcessingTypes: [],
      disclosureSnapshot: {
        schemaVersion: 1,
        source: 'ACTIVE_POLICY',
        environment: currentLineEnvironment(),
        policyId: disclosure.policyId,
        policyVersion: disclosure.policyVersion,
        platform: disclosure.platform,
        disclosureText: disclosure.disclosureText,
        hashtags: disclosure.hashtags,
        guidance: disclosure.guidance,
        outputMetadata: disclosure.outputMetadata,
        resolvedAt: disclosure.resolvedAt.toISOString(),
        standardComposition: input.compositionMode === 'STANDARD',
        aiVideoGeneration: input.compositionMode === 'AI_SCENES',
        explanation:
          input.compositionMode === 'AI_SCENES'
            ? 'AIが台本とAI動画用の場面を提案します。外部生成は承認後に、設定と予算を確認して開始します。'
            : '選択した写真または背景と字幕を合成します。音声を有効にした場合はAIナレーションを追加します。',
      },
    });
    return Response.json(
      { data: publicVideoProject(project), requestId },
      { status: 201, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
