import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';
import { resolveManagedServiceContext } from '../services/public-service';

const channel = z.enum(['EMAIL', 'LINE']);
const purpose = z.enum([
  'REGISTRATION_COMPLETE',
  'REMINDER',
  'WEEKLY_REPORT',
  'GENERAL_ANNOUNCEMENT',
]);
const saveSchema = z
  .object({
    id: z.string().uuid().optional(),
    channel,
    purpose,
    name: z.string().trim().min(1).max(120),
    subject: z.union([z.literal(''), z.string().trim().min(1).max(200)]),
    body: z.string().trim().min(1).max(10_000),
    isActive: z.boolean(),
  })
  .strict();
const archiveSchema = z.object({ id: z.string().uuid() }).strict();

async function context(serviceSlug: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return { actor, service: await resolveManagedServiceContext(serviceSlug, actor.userId) };
}

function respond(request: Request, operation: () => Promise<unknown>) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  return operation()
    .then((data) =>
      Response.json({ data, requestId }, { headers: { 'cache-control': 'private, no-store' } }),
    )
    .catch((error) => {
      const mapped = toApiError(error, requestId);
      return Response.json(mapped.body, { status: mapped.status });
    });
}

export function listServiceMessageTemplatesResponse(request: Request, serviceSlug: string) {
  return respond(request, async () => {
    const { actor, service } = await context(serviceSlug);
    void actor;
    const db = await import('@bunshin/database');
    return db.prisma.serviceMessageTemplate.findMany({
      where: { workspaceId: service.workspaceId, groupId: service.serviceId },
      orderBy: [{ channel: 'asc' }, { purpose: 'asc' }, { updatedAt: 'desc' }],
    });
  });
}

export function saveServiceMessageTemplateResponse(request: Request, serviceSlug: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const value = saveSchema.parse(await request.json());
    if (value.channel === 'EMAIL' && !value.subject)
      throw new ApplicationError('VALIDATION_ERROR', 'メールテンプレートには件名が必要です');
    if (value.channel === 'LINE' && value.subject)
      throw new ApplicationError('VALIDATION_ERROR', 'LINEテンプレートに件名は設定できません');
    const { actor, service } = await context(serviceSlug);
    const db = await import('@bunshin/database');
    if (value.id) {
      const existing = await db.prisma.serviceMessageTemplate.findFirst({
        where: { id: value.id, workspaceId: service.workspaceId, groupId: service.serviceId },
      });
      if (!existing) throw new ApplicationError('NOT_FOUND', 'template not found');
      return db.prisma.serviceMessageTemplate.update({
        where: { id: existing.id },
        data: { ...value, subject: value.subject || null, updatedByUserId: actor.userId },
      });
    }
    return db.prisma.serviceMessageTemplate.create({
      data: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        channel: value.channel,
        purpose: value.purpose,
        name: value.name,
        subject: value.subject || null,
        body: value.body,
        isActive: value.isActive,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
      },
    });
  });
}

export function archiveServiceMessageTemplateResponse(request: Request, serviceSlug: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const value = archiveSchema.parse(await request.json());
    const { actor, service } = await context(serviceSlug);
    const db = await import('@bunshin/database');
    const existing = await db.prisma.serviceMessageTemplate.findFirst({
      where: { id: value.id, workspaceId: service.workspaceId, groupId: service.serviceId },
    });
    if (!existing) throw new ApplicationError('NOT_FOUND', 'template not found');
    return db.prisma.serviceMessageTemplate.update({
      where: { id: existing.id },
      data: { isActive: false, updatedByUserId: actor.userId },
    });
  });
}
