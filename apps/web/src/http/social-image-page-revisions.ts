import 'server-only';
import {
  ReplaceSocialImageMediaPage,
  getSocialImageTemplateDefinition,
  type SocialImageLayout,
} from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { assertOrganizationGenerationQuota } from '../organization-generation-quota';
import { recordAiUsageSafely } from '../observability/ai-usage';
import { OpenAiSocialImageGenerationAdapter } from '../providers/openai-social-image-generation';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { socialImagePagePrompt } from '../jobs/social-image-generation-job-handler';
import { loadBundledSocialImageFonts, ManagedSocialImageRenderer } from '../social-image-renderer';
import { SupabaseSocialImageStorage } from '../social-image-storage';

const uuid = z.string().uuid();
const schema = z
  .object({
    mode: z.enum(['TEXT', 'PHOTO', 'BOTH']),
    expectedRevision: z.number().int().positive(),
    currentMediaId: uuid,
    headline: z.string().trim().min(1).max(30).optional(),
    body: z.string().trim().min(1).max(120).optional(),
    photoInstruction: z.string().trim().min(3).max(200).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.mode === 'TEXT' || value.mode === 'BOTH') && (!value.headline || !value.body))
      context.addIssue({ code: 'custom', message: 'headline and body are required' });
    if ((value.mode === 'PHOTO' || value.mode === 'BOTH') && !value.photoInstruction)
      context.addIssue({ code: 'custom', message: 'photoInstruction is required' });
  });

function splitBody(
  value: string,
  rule: { minLines: number; maxLines: number; maxCharactersPerLine: number },
) {
  const words = value.replace(/\s+/g, ' ').trim();
  const characters = Array.from(words);
  const lineCount = Math.max(
    rule.minLines,
    Math.ceil(characters.length / rule.maxCharactersPerLine),
  );
  if (characters.length < rule.minLines || lineCount > rule.maxLines)
    throw new ApplicationError('VALIDATION_ERROR', '説明文が長すぎるか短すぎます');
  const charactersPerLine = Math.ceil(characters.length / lineCount);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += charactersPerLine)
    lines.push(characters.slice(index, index + charactersPerLine).join(''));
  return lines;
}

async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    if (!request.body) throw new Error('empty body');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8_192) {
        await reader.cancel();
        throw new Error('body too large');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

export async function reviseSocialImagePageResponse(
  request: Request,
  workspaceId: string,
  groupId: string,
  requestResourceId: string,
  pageIndexValue: string,
) {
  const correlationId = requestIdFromHeader(request.headers.get('x-request-id'));
  let cleanup: (() => Promise<void>) | null = null;
  try {
    requireSameOrigin(request);
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const parsed = schema.parse(await jsonBody(request));
    const pageIndex = z.coerce.number().int().min(0).max(4).parse(pageIndexValue);
    const db = await import('@bunshin/database');
    const repository = new db.PrismaSocialImageGenerationRequestRepository();
    const imageRequest = await repository.findOwned({
      workspaceId: uuid.parse(workspaceId),
      groupId: uuid.parse(groupId),
      actorUserId: actor.userId,
      requestId: uuid.parse(requestResourceId),
    });
    if (
      !imageRequest ||
      imageRequest.status !== 'READY_FOR_REVIEW' ||
      imageRequest.revision !== parsed.expectedRevision
    )
      throw new ApplicationError('CONFLICT', '画像が更新されています。画面を読み直してください');
    if (imageRequest.revision >= 8)
      throw new ApplicationError('FORBIDDEN', 'この投稿で修正できる回数を使い切りました');
    const mediaPages = await repository.listMediaOwned({
      workspaceId,
      groupId,
      actorUserId: actor.userId,
      requestId: imageRequest.id,
    });
    const current = mediaPages.find(
      (media) => media.id === parsed.currentMediaId && media.pageIndex === pageIndex,
    );
    if (!current || current.status !== 'READY')
      throw new ApplicationError('CONFLICT', 'この画像は修正できません');

    const { carouselPages, ...cover } = imageRequest.layout;
    const pages = [cover, ...(carouselPages ?? [])];
    const oldPage = pages[pageIndex];
    if (!oldPage || pages.length !== 5)
      throw new ApplicationError('CONFLICT', '5枚の投稿画像を確認できません');
    const changesText = parsed.mode !== 'PHOTO';
    const changesPhoto = parsed.mode !== 'TEXT';
    const definition = getSocialImageTemplateDefinition(oldPage.templateKey);
    const pageLayout = {
      ...oldPage,
      ...(changesText
        ? { headline: parsed.headline!, bodyLines: splitBody(parsed.body!, definition.body) }
        : {}),
      ...(changesPhoto
        ? {
            visualScene:
              `${oldPage.visualScene ?? oldPage.headline}。修正希望：${parsed.photoInstruction}`.slice(
                0,
                300,
              ),
          }
        : {}),
    };
    pages[pageIndex] = pageLayout;
    const nextLayout: SocialImageLayout = {
      ...pages[0]!,
      carouselPages: pages.slice(1),
    };

    const storage = new SupabaseSocialImageStorage();
    let sourceBytes: Uint8Array | null = current.sourceStorageKey
      ? await storage.readStoredPng(current.sourceStorageKey)
      : null;
    if (changesPhoto) {
      await assertOrganizationGenerationQuota({ workspaceId, kind: 'IMAGE' });
      const enrollment = await db.prisma.socialImagePilotEnrollment.findFirst({
        where: {
          id: imageRequest.pilotEnrollmentId,
          workspaceId,
          groupId,
          status: 'ACTIVE',
          revokedAt: null,
        },
        select: { pilot: { select: { defaultModel: true, defaultQuality: true } } },
      });
      if (!enrollment) throw new ApplicationError('FORBIDDEN', '画像修正機能を利用できません');
      const coverMedia = mediaPages.find((media) => media.pageIndex === 0);
      const referenceKey = coverMedia?.sourceStorageKey ?? current.sourceStorageKey;
      const reference = referenceKey ? await storage.readStoredPng(referenceKey) : undefined;
      const runtime = await resolveOpenAiRuntimeConfiguration();
      const provider = new OpenAiSocialImageGenerationAdapter({ apiKey: runtime.apiKey });
      const generated = await provider.generate({
        requestId: `${imageRequest.id}:revision:${imageRequest.revision}:page:${pageIndex + 1}`,
        prompt: socialImagePagePrompt(pageLayout, Boolean(reference), pageIndex, 5, pages),
        ...(reference ? { referenceImage: reference } : {}),
        width: 1080,
        height: 1350,
        model: enrollment.pilot.defaultModel,
        quality: pageIndex === 0 ? 'high' : enrollment.pilot.defaultQuality,
      });
      sourceBytes = generated.bytes;
      await recordAiUsageSafely({
        workspaceId,
        bunshinId: imageRequest.bunshinId,
        actorUserId: actor.userId,
        taskType: 'SOCIAL_IMAGE_GENERATION',
        provider: generated.provider,
        model: generated.model,
        promptVersion: 'social-image-page-revision-v2',
        status: 'SUCCESS',
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        latencyMs: generated.latencyMs,
        estimatedCostUsdMicros: runtime.requestCostUsdMicros,
        pricingVersion: 'ADMIN_FIXED_REQUEST_COST_PER_PAGE',
        idempotencyKey: `social-image-revision:${imageRequest.id}:${imageRequest.revision}:${pageIndex}`,
      });
    }
    const renderer = new ManagedSocialImageRenderer(await loadBundledSocialImageFonts());
    const rendered = await renderer.render({
      layout: pageLayout,
      sourceAsset:
        definition.assetPlacement === 'NONE' ? null : sourceBytes ? Buffer.from(sourceBytes) : null,
    });
    const replacementMediaId = randomUUID();
    const stored = await storage.store({
      workspaceId,
      groupId,
      ownerUserId: actor.userId,
      requestId: imageRequest.id,
      mediaId: replacementMediaId,
      source: sourceBytes ? { bytes: sourceBytes, mimeType: 'image/png' } : null,
      completed: rendered.completedPng,
      thumbnail: rendered.thumbnailPng,
    });
    cleanup = () =>
      storage.remove({
        workspaceId,
        groupId,
        ownerUserId: actor.userId,
        requestId: imageRequest.id,
        mediaId: replacementMediaId,
        ...(sourceBytes ? { sourceMimeType: 'image/png' as const } : {}),
      });
    const replaced = await new ReplaceSocialImageMediaPage(repository).execute({
      workspaceId,
      groupId,
      actorUserId: actor.userId,
      requestId: imageRequest.id,
      expectedRevision: imageRequest.revision,
      currentMediaId: current.id,
      pageIndex,
      layout: nextLayout,
      replacement: { mediaId: replacementMediaId, ...stored },
    });
    cleanup = null;
    await storage
      .remove({
        workspaceId,
        groupId,
        ownerUserId: actor.userId,
        requestId: imageRequest.id,
        mediaId: current.id,
        ...(current.sourceStorageKey ? { sourceMimeType: 'image/png' as const } : {}),
      })
      .catch(() => undefined);
    return Response.json(
      {
        data: { id: replaced.id, pageIndex, revision: imageRequest.revision + 1 },
        requestId: correlationId,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    if (cleanup) await cleanup().catch(() => undefined);
    const mapped = toApiError(error, correlationId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
