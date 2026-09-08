import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeSocialImageLayout, GroupFeatureEntitlementService } from '@bunshin/application';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import {
  OpenAiSocialImageGenerationAdapter,
  OpenAiSocialImageProviderError,
} from '../providers/openai-social-image-generation';
import { ManagedSocialImageRenderer, loadBundledSocialImageFonts } from '../social-image-renderer';
import { SupabaseSocialImageStorage } from '../social-image-storage';
import { recordAiUsageSafely } from '../observability/ai-usage';

const schema = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    bunshinId: z.uuid(),
    headline: z.string().trim().min(1).max(20),
    bodyLines: z.array(z.string().trim().min(1).max(28)).min(1).max(3),
    cta: z.string().trim().max(28),
    artDirection: z.string().trim().min(10).max(1000),
  })
  .strict();
const promptVersion = 'social-image-admin-sample-v1';
const model = 'gpt-image-1';
const localDate = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/** Quality trials are restricted to the administrator's own bunshin and consented membership. */
export async function imageSampleScope(groupId: string, bunshinId?: string) {
  if (!z.uuid().safeParse(groupId).success) return null;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return null;
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admin) return null;
  const member = await db.prisma.groupMembership.findFirst({
    where: {
      groupId,
      userId: actor.userId,
      status: 'ACTIVE',
      consentedAt: { not: null },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { workspaceId: true, group: { select: { name: true } } },
  });
  if (!member) return null;
  const bunshins = await db.prisma.bunshin.findMany({
    where: {
      ...(bunshinId ? { id: bunshinId } : {}),
      workspaceId: member.workspaceId,
      groupId,
      ownerUserId: actor.userId,
      status: { not: 'ARCHIVED' },
      capabilityAssignments: { some: { capabilityType: 'SOCIAL', status: 'ACTIVE' } },
    },
    select: { id: true, name: true },
  });
  if (!bunshins.length) return null;
  return { db, actor, member, bunshins };
}

export async function createImageSample(request: Request) {
  let sampleId: string | undefined;
  let stage = 'ACCESS';
  let scope: Awaited<ReturnType<typeof imageSampleScope>> = null;
  try {
    requireSameOrigin(request);
    const raw = await request.text();
    if (raw.length > 8000) throw new ApplicationError('VALIDATION_ERROR', 'input too large');
    const input = schema.parse(JSON.parse(raw));
    scope = await imageSampleScope(input.groupId, input.bunshinId);
    if (!scope) throw new ApplicationError('FORBIDDEN', 'own administrator sample only');
    const { db, actor, member } = scope;
    const layout = normalizeSocialImageLayout({
      templateKey: 'EMPATHY_QUOTE',
      headline: input.headline,
      bodyLines: input.bodyLines,
      cta: input.cta || null,
      accentColor: '#0B2D5C',
    });
    const inputHash = createHash('sha256')
      .update(JSON.stringify({ ...input, layout }))
      .digest('hex');
    const runtime = await resolveOpenAiRuntimeConfiguration();
    const now = new Date();
    const date = localDate(now);
    const dailyFrom = new Date(`${date}T00:00:00+09:00`);
    const monthlyFrom = new Date(`${date.slice(0, 7)}-01T00:00:00+09:00`);
    const result = await db.prisma.$transaction(
      async (tx) => {
        const existing = await tx.socialImageSample.findUnique({ where: { id: input.id } });
        if (existing) {
          if (
            existing.ownerUserId !== actor.userId ||
            existing.groupId !== input.groupId ||
            existing.inputHash !== inputHash
          )
            throw new ApplicationError('CONFLICT', 'sample input changed');
          return { created: false, sample: existing };
        }
        // Count all attempts, including failures, so retries cannot evade the trial budget.
        const [daily, monthly] = await Promise.all([
          tx.socialImageSample.count({
            where: { groupId: input.groupId, createdAt: { gte: dailyFrom } },
          }),
          tx.socialImageSample.count({
            where: { groupId: input.groupId, createdAt: { gte: monthlyFrom } },
          }),
        ]);
        if (daily >= 3 || monthly >= 10)
          throw new ApplicationError('FORBIDDEN', '試作上限（1日3枚・月10枚）に達しました');
        const sample = await tx.socialImageSample.create({
          data: {
            id: input.id,
            workspaceId: member.workspaceId,
            groupId: input.groupId,
            ownerUserId: actor.userId,
            bunshinId: input.bunshinId,
            inputHash,
            layout: { ...layout },
            artDirection: input.artDirection,
            model,
            status: 'GENERATING',
          },
        });
        return { created: true, sample };
      },
      { isolationLevel: 'Serializable' },
    );
    if (!result.created)
      return NextResponse.json({ id: result.sample.id, status: result.sample.status });
    sampleId = input.id;
    const access = await new GroupFeatureEntitlementService(
      new db.PrismaGroupFeatureEntitlementRepository(),
    ).consumeAccess({
      workspaceId: member.workspaceId,
      groupId: input.groupId,
      actorUserId: actor.userId,
      featureKey: 'SOCIAL.IMAGE_GENERATION',
      operationKey: `image-sample:${input.id}`,
      localDate: date,
      now,
    });
    if (!access.allowed)
      throw new ApplicationError('FORBIDDEN', '画像生成の利用設定または上限を確認してください');
    stage = 'FONTS';
    const fonts = await loadBundledSocialImageFonts();
    stage = 'PROVIDER';
    const generated = await new OpenAiSocialImageGenerationAdapter({
      apiKey: runtime.apiKey,
    }).generate({
      requestId: input.id,
      model,
      quality: 'medium',
      width: 1080,
      height: 1350,
      prompt: [
        'Create a refined editorial illustration for a Japanese social media introduction. Portrait composition, coherent lighting and restrained navy, warm cream and soft gold palette.',
        'No text, letters, logos, watermarks or interface elements. Keep the central area quiet and low-detail for a separate Japanese text overlay. Place the storytelling details around the edges. Avoid generic robots, floating UI and stock-photo handshakes.',
        `Art direction: ${input.artDirection}`,
        `Communication theme: ${input.headline}. ${input.bodyLines.join(' / ')}`,
      ].join(' '),
    });
    await recordAiUsageSafely({
      workspaceId: member.workspaceId,
      bunshinId: input.bunshinId,
      actorUserId: actor.userId,
      taskType: 'SOCIAL_IMAGE_GENERATION',
      provider: 'OPENAI',
      model,
      promptVersion,
      status: 'SUCCESS',
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      latencyMs: generated.latencyMs,
      estimatedCostUsdMicros: runtime.requestCostUsdMicros,
      pricingVersion: 'ADMIN_FIXED_REQUEST_COST',
      idempotencyKey: `image-sample:${input.id}`,
    });
    stage = 'COMPOSE';
    const rendered = await new ManagedSocialImageRenderer(fonts).render({
      layout,
      sourceAsset: Buffer.from(generated.bytes),
    });
    stage = 'STORAGE';
    await new SupabaseSocialImageStorage().store({
      workspaceId: member.workspaceId,
      groupId: input.groupId,
      ownerUserId: actor.userId,
      requestId: input.id,
      mediaId: input.id,
      source: null,
      completed: rendered.completedPng,
      thumbnail: rendered.thumbnailPng,
    });
    stage = 'COMPLETE';
    await db.prisma.socialImageSample.update({
      where: { id: input.id },
      data: { status: 'READY' },
    });
    return NextResponse.json({ id: input.id, status: 'READY' });
  } catch (error) {
    if (sampleId) {
      const db = await import('@bunshin/database');
      await db.prisma.socialImageSample.updateMany({
        where: { id: sampleId, status: 'GENERATING' },
        data: {
          status: 'FAILED',
          errorCode:
            error instanceof OpenAiSocialImageProviderError
              ? error.category
              : `SAMPLE_${stage}_FAILED`,
        },
      });
      if (scope && error instanceof OpenAiSocialImageProviderError)
        await recordAiUsageSafely({
          workspaceId: scope.member.workspaceId,
          bunshinId: scope.bunshins[0]!.id,
          actorUserId: scope.actor.userId,
          taskType: 'SOCIAL_IMAGE_GENERATION',
          provider: 'OPENAI',
          model,
          promptVersion,
          status: 'FAILED',
          inputTokens: null,
          outputTokens: null,
          latencyMs: 0,
          estimatedCostUsdMicros: null,
          pricingVersion: 'UNAVAILABLE',
          errorCode: error.category,
          idempotencyKey: `image-sample:${sampleId}`,
        });
    }
    const safe =
      error instanceof OpenAiSocialImageProviderError
        ? new ApplicationError('CONFIGURATION_ERROR', `画像生成に失敗しました（${error.category}）`)
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? new ApplicationError(
              'VALIDATION_ERROR',
              '見出し・本文の文字数や入力内容を確認してください',
            )
          : error;
    const response = toApiError(safe, 'image-sample');
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function readImageSample(id: string, download: boolean) {
  if (!z.uuid().safeParse(id).success) return new Response('Not found', { status: 404 });
  const db = await import('@bunshin/database');
  const sample = await db.prisma.socialImageSample.findUnique({ where: { id } });
  const scope = sample ? await imageSampleScope(sample.groupId, sample.bunshinId) : null;
  if (!sample || !scope || sample.ownerUserId !== scope.actor.userId)
    return new Response('Not found', { status: 404 });
  if (sample.status === 'GENERATING' && Date.now() - sample.createdAt.getTime() > 10 * 60_000) {
    await db.prisma.socialImageSample.updateMany({
      where: { id, status: 'GENERATING' },
      data: { status: 'FAILED', errorCode: 'INTERRUPTED' },
    });
    return NextResponse.json(
      { id, status: 'FAILED', errorCode: 'INTERRUPTED' },
      { headers: { 'cache-control': 'no-store' } },
    );
  }
  if (!download)
    return NextResponse.json(
      { id, status: sample.status, errorCode: sample.errorCode },
      { headers: { 'cache-control': 'no-store' } },
    );
  if (sample.status !== 'READY') return new Response('Not ready', { status: 404 });
  const signed = await new SupabaseSocialImageStorage().createReadUrl({
    workspaceId: sample.workspaceId,
    groupId: sample.groupId,
    ownerUserId: sample.ownerUserId,
    requestId: id,
    mediaId: id,
    kind: 'COMPLETED',
  });
  return new Response(null, {
    status: 303,
    headers: {
      location: signed.url,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

export async function deleteImageSample(request: Request, id: string) {
  try {
    requireSameOrigin(request);
    if (!z.uuid().safeParse(id).success) return new Response('Not found', { status: 404 });
    const db = await import('@bunshin/database');
    const sample = await db.prisma.socialImageSample.findUnique({ where: { id } });
    const scope = sample ? await imageSampleScope(sample.groupId, sample.bunshinId) : null;
    if (!sample || !scope || sample.ownerUserId !== scope.actor.userId)
      return new Response('Not found', { status: 404 });
    if (sample.status === 'GENERATING') return new Response('Still generating', { status: 409 });
    await new SupabaseSocialImageStorage().remove({
      workspaceId: sample.workspaceId,
      groupId: sample.groupId,
      ownerUserId: sample.ownerUserId,
      requestId: id,
      mediaId: id,
      sourceMimeType: 'image/png',
    });
    // Retain the attempt count even after deletion; deleting images must not reset the budget.
    await db.prisma.socialImageSample.update({
      where: { id },
      data: { status: 'DELETED', layout: {}, artDirection: '', errorCode: null },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    const result = toApiError(error, 'image-sample-delete');
    return NextResponse.json(result.body, { status: result.status });
  }
}
