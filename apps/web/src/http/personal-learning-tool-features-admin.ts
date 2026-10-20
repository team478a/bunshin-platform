import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const createSchema = z
  .object({
    action: z.literal('CREATE'),
    toolKey: z.enum(['CHATGPT', 'CLAUDE', 'GEMINI', 'CANVA']),
    title: z.string().trim().min(3).max(160),
    summary: z.string().trim().min(20).max(2000),
    sourceUrl: z.string().trim().url().max(2000),
    sourceTitle: z.string().trim().min(3).max(500),
    publishedAt: z.string().datetime().nullable(),
  })
  .strict();
const reviewSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    featureId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

const officialHosts: Record<z.infer<typeof createSchema>['toolKey'], readonly string[]> = {
  CHATGPT: ['openai.com'],
  CLAUDE: ['anthropic.com'],
  GEMINI: ['google.com', 'deepmind.google'],
  CANVA: ['canva.com'],
};

function validatedOfficialUrl(value: string, toolKey: keyof typeof officialHosts) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid source URL');
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username ||
    url.password ||
    url.hash ||
    !officialHosts[toolKey].some((host) => hostname === host || hostname.endsWith(`.${host}`))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'official HTTPS source required');
  return url.toString();
}

async function adminActor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin) throw new ApplicationError('NOT_FOUND', 'admin page not found');
  return { userId: user.userId, role: admin.role };
}

export async function listPersonalLearningToolFeaturesResponse() {
  const requestId = requestIdFromHeader(null);
  try {
    await adminActor();
    const db = await import('@bunshin/database');
    const items = await db.prisma.personalLearningToolFeatureUpdate.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        creator: { select: { displayName: true } },
        reviewer: { select: { displayName: true } },
        audits: {
          orderBy: { occurredAt: 'desc' },
          take: 10,
          include: { actor: { select: { displayName: true } } },
        },
      },
    });
    return Response.json(
      { data: items, requestId },
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

export async function savePersonalLearningToolFeatureResponse(request: Request) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    const actor = await adminActor();
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    let value: unknown;
    try {
      value = await request.json();
    } catch (error) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
    }
    const create = createSchema.safeParse(value);
    const review = reviewSchema.safeParse(value);
    const db = await import('@bunshin/database');
    if (create.success) {
      const sourceUrl = validatedOfficialUrl(create.data.sourceUrl, create.data.toolKey);
      const result = await db.prisma.$transaction(async (tx) => {
        const created = await tx.personalLearningToolFeatureUpdate.create({
          data: {
            toolKey: create.data.toolKey,
            title: create.data.title,
            summary: create.data.summary,
            sourceUrl,
            sourceTitle: create.data.sourceTitle,
            publishedAt: create.data.publishedAt ? new Date(create.data.publishedAt) : null,
            createdByUserId: actor.userId,
          },
          select: { id: true },
        });
        await tx.personalLearningToolFeatureAudit.create({
          data: { featureId: created.id, actorUserId: actor.userId, action: 'CREATED' },
        });
        return created;
      });
      return Response.json({ data: result, requestId }, { status: 201 });
    }
    if (review.success) {
      if (actor.role !== 'SUPER_ADMIN')
        throw new ApplicationError('FORBIDDEN', 'super administrator review required');
      const now = new Date();
      const result = await db.prisma.$transaction(async (tx) => {
        const current = await tx.personalLearningToolFeatureUpdate.findUnique({
          where: { id: review.data.featureId },
          select: { id: true, status: true },
        });
        if (!current || current.status !== 'PENDING')
          throw new ApplicationError('CONFLICT', 'feature is no longer pending review');
        const status = review.data.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const updated = await tx.personalLearningToolFeatureUpdate.updateMany({
          where: { id: current.id, status: 'PENDING' },
          data: {
            status,
            reviewedByUserId: actor.userId,
            reviewedAt: now,
            ...(status === 'APPROVED'
              ? { expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) }
              : {}),
          },
        });
        if (updated.count !== 1)
          throw new ApplicationError('CONFLICT', 'feature review changed concurrently');
        await tx.personalLearningToolFeatureAudit.create({
          data: {
            featureId: current.id,
            actorUserId: actor.userId,
            action: status,
            reason: review.data.reason,
          },
        });
        return { id: current.id, status };
      });
      return Response.json({ data: result, requestId });
    }
    throw new ApplicationError('VALIDATION_ERROR', 'invalid body');
  } catch (error) {
    const mapped = toApiError(error, requestId);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
}
