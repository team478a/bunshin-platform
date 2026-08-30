import 'server-only';
import { ServiceFoundationService, type ServiceFoundationRecord } from '@bunshin/application';

const SERVICE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PublicServiceContext {
  workspaceId: string;
  serviceId: string;
  configuration: ServiceFoundationRecord;
}

export const SERVICE_MANAGEMENT_ROLES = ['SERVICE_OWNER', 'SERVICE_ADMIN'] as const;
export type ServiceManagementRole = (typeof SERVICE_MANAGEMENT_ROLES)[number];
export const SERVICE_CONTENT_ROLES = ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] as const;
export type ServiceContentRole = (typeof SERVICE_CONTENT_ROLES)[number];
export type ServiceManagementPermission = 'ADMINISTRATION' | 'CONTENT';

export interface ManagedServiceContext extends PublicServiceContext {
  serviceRole: ServiceContentRole;
}

export async function resolvePublicServiceContext(slug: string): Promise<PublicServiceContext> {
  if (slug.length > 80 || !SERVICE_SLUG.test(slug)) throw new Error('SERVICE_NOT_FOUND');
  const db = await import('@bunshin/database');
  const configuration = await new ServiceFoundationService(
    new db.PrismaServiceFoundationRepository(),
  ).findPublicBySlug({ slug });
  return {
    workspaceId: configuration.workspaceId,
    serviceId: configuration.groupId,
    configuration,
  };
}

export async function resolveManagedServiceContext(
  slug: string,
  actorUserId: string,
  permission: ServiceManagementPermission = 'ADMINISTRATION',
): Promise<ManagedServiceContext> {
  if (slug.length > 80 || !SERVICE_SLUG.test(slug)) throw new Error('SERVICE_NOT_FOUND');
  const db = await import('@bunshin/database');
  const allowedRoles =
    permission === 'CONTENT' ? [...SERVICE_CONTENT_ROLES] : [...SERVICE_MANAGEMENT_ROLES];
  const target = await db.prisma.serviceConfiguration.findFirst({
    where: {
      slug,
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        memberships: {
          some: {
            userId: actorUserId,
            serviceRole: { in: allowedRoles },
            status: 'ACTIVE',
          },
        },
      },
    },
    select: {
      workspaceId: true,
      groupId: true,
      group: {
        select: {
          memberships: {
            where: { userId: actorUserId, status: 'ACTIVE' },
            select: { serviceRole: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!target) throw new Error('SERVICE_NOT_FOUND');
  const serviceRole = target.group.memberships[0]?.serviceRole;
  if (!serviceRole || !(allowedRoles as readonly string[]).includes(serviceRole))
    throw new Error('SERVICE_NOT_FOUND');
  const configuration = await new ServiceFoundationService(
    new db.PrismaServiceFoundationRepository(),
  ).findByGroup({ ...target, actorUserId });
  return {
    workspaceId: configuration.workspaceId,
    serviceId: configuration.groupId,
    configuration,
    serviceRole: serviceRole as ServiceContentRole,
  };
}
