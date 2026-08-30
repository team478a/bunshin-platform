import 'server-only';
import { ServiceStaffRoleService } from '@bunshin/application';
import { requestIdFromHeader } from '@bunshin/observability';
import { ApplicationError, toApiError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';
import { requireSameOrigin } from '../auth/request-security';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
const membershipId = z.string().uuid();
const updateSchema = z
  .object({
    serviceRole: z.enum(['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR', 'PARTICIPANT']),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();

async function target(serviceSlug: string) {
  const db = await import('@bunshin/database');
  const service = await db.prisma.serviceConfiguration.findFirst({
    where: {
      slug: slug.parse(serviceSlug),
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { workspaceId: true, groupId: true },
  });
  if (!service) throw new ApplicationError('NOT_FOUND', 'service unavailable');
  return { db, service };
}

export async function listServiceStaffRolesResponse(request: Request, serviceSlug: string) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const { db, service } = await target(serviceSlug);
    const data = await new ServiceStaffRoleService(new db.PrismaServiceStaffRoleRepository()).list({
      workspaceId: service.workspaceId,
      groupId: service.groupId,
      actorUserId: actor.userId,
    });
    return Response.json(
      { data, requestId },
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

export async function updateServiceStaffRoleResponse(
  request: Request,
  serviceSlug: string,
  rawMembershipId: string,
) {
  const requestId = requestIdFromHeader(request.headers.get('x-request-id'));
  try {
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
    const [{ db, service }, value] = await Promise.all([
      target(serviceSlug),
      updateSchema.parseAsync(request.json()),
    ]);
    const data = await new ServiceStaffRoleService(new db.PrismaServiceStaffRoleRepository()).set({
      workspaceId: service.workspaceId,
      groupId: service.groupId,
      membershipId: membershipId.parse(rawMembershipId),
      serviceRole: value.serviceRole,
      actorUserId: actor.userId,
      reason: value.reason,
    });
    return Response.json(
      { data, requestId },
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
