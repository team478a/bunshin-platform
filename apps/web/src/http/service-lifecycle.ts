import 'server-only';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const uuid = z.string().uuid();

const lifecycleSchema = z
  .object({
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    poweredByEnabled: z.boolean(),
    startsAt: z.string().datetime({ offset: true }).nullable(),
    endsAt: z.string().datetime({ offset: true }).nullable(),
    reason: z.string().min(1).max(1000),
  })
  .strict();

export async function updateServiceLifecycleResponse(request: Request, configurationId: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const user = await (await currentUserProvider()).getCurrentUser();
    if (!user) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    if (!uuid.safeParse(configurationId).success)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service id');
    const value = lifecycleSchema.parse(await request.json());
    const startsAt = value.startsAt === null ? null : new Date(value.startsAt);
    const endsAt = value.endsAt === null ? null : new Date(value.endsAt);
    if (startsAt !== null && endsAt !== null && startsAt >= endsAt)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service period');

    const db = await import('@bunshin/database');
    const saved = await db.prisma.$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findFirst({
        where: { userId: user.userId, status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true },
      });
      if (admin === null)
        throw new ApplicationError('FORBIDDEN', 'platform administrator required');
      const existing = await tx.serviceConfiguration.findUnique({
        where: { id: configurationId },
        include: { group: { select: { status: true } } },
      });
      if (existing === null) throw new ApplicationError('NOT_FOUND', 'service not found');
      const entitlement = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: existing.workspaceId },
        select: { oemEnabled: true, suspended: true },
      });
      if (entitlement?.suspended)
        throw new ApplicationError('FORBIDDEN', 'organization operations are suspended');
      if (entitlement && !entitlement.oemEnabled && !value.poweredByEnabled)
        throw new ApplicationError('FORBIDDEN', 'OEM is not included in the organization contract');

      const [configuration, group] = await Promise.all([
        tx.serviceConfiguration.update({
          where: { id: configurationId },
          data: {
            visibility: value.visibility,
            poweredByEnabled: value.poweredByEnabled,
            startsAt,
            endsAt,
            updatedByUserId: user.userId,
          },
        }),
        tx.group.update({
          where: { id: existing.groupId },
          data: { status: value.status },
          select: { status: true },
        }),
      ]);
      const beforeData = {
        visibility: existing.visibility,
        status: existing.group.status,
        poweredByEnabled: existing.poweredByEnabled,
        startsAt: existing.startsAt?.toISOString() ?? null,
        endsAt: existing.endsAt?.toISOString() ?? null,
      };
      const afterData = {
        visibility: configuration.visibility,
        status: group.status,
        poweredByEnabled: configuration.poweredByEnabled,
        startsAt: configuration.startsAt?.toISOString() ?? null,
        endsAt: configuration.endsAt?.toISOString() ?? null,
      };
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: existing.workspaceId,
          groupId: existing.groupId,
          configurationId: existing.id,
          action:
            value.status === 'SUSPENDED'
              ? 'SUSPENDED'
              : existing.group.status === 'SUSPENDED'
                ? 'REACTIVATED'
                : 'LIFECYCLE_UPDATED',
          beforeData,
          afterData,
          reason: value.reason.trim(),
          performedByUserId: user.userId,
        },
      });
      return { id: existing.id, ...afterData };
    });
    return Response.json(
      { data: saved, requestId },
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
