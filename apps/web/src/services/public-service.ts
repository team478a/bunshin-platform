import 'server-only';
import { ServiceFoundationService, type ServiceFoundationRecord } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { isRouteNotFound } from '../navigation/route-not-found';
import { enforceBusinessFreeRegistrationSettings } from './business-daily-service-settings';
import { readServiceOnboardingSettings } from './service-onboarding-settings';

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

export function effectiveServiceConfiguration(
  configuration: ServiceFoundationRecord,
): ServiceFoundationRecord {
  const onboarding = readServiceOnboardingSettings(
    configuration.registration.onboardingConfig,
    configuration.registration.surveyConfig,
  );
  if (!onboarding.businessProfileEnabled) return configuration;
  const registration = enforceBusinessFreeRegistrationSettings({
    businessProfileEnabled: true,
    registrationMode: configuration.registration.mode,
    emailEnabled: configuration.registration.emailEnabled,
    lineEnabled: configuration.registration.lineEnabled,
    inviteCodeEnabled: configuration.registration.inviteCodeEnabled,
    referralEnabled: configuration.registration.referralEnabled,
  });
  return {
    ...configuration,
    registration: {
      ...configuration.registration,
      mode: registration.registrationMode,
      emailEnabled: registration.emailEnabled,
      lineEnabled: registration.lineEnabled,
      inviteCodeEnabled: registration.inviteCodeEnabled,
      referralEnabled: registration.referralEnabled,
    },
  };
}

export async function resolvePublicServiceContext(slug: string): Promise<PublicServiceContext> {
  if (slug.length > 80 || !SERVICE_SLUG.test(slug))
    throw new ApplicationError('NOT_FOUND', 'service not found');
  const db = await import('@bunshin/database');
  const storedConfiguration = await new ServiceFoundationService(
    new db.PrismaServiceFoundationRepository(),
  ).findPublicBySlug({ slug });
  const configuration = effectiveServiceConfiguration(storedConfiguration);
  return {
    workspaceId: configuration.workspaceId,
    serviceId: configuration.groupId,
    configuration,
  };
}

/** 公開前の限定運用でも、参加済みユーザーには自分のサービス画面を提供する。 */
export async function resolveMemberServiceContext(
  slug: string,
  actorUserId: string,
): Promise<PublicServiceContext> {
  if (slug.length > 80 || !SERVICE_SLUG.test(slug))
    throw new ApplicationError('NOT_FOUND', 'service not found');
  const db = await import('@bunshin/database');
  const storedConfiguration = await new ServiceFoundationService(
    new db.PrismaServiceFoundationRepository(),
  ).findMemberBySlug({ slug, actorUserId });
  const configuration = effectiveServiceConfiguration(storedConfiguration);
  return {
    workspaceId: configuration.workspaceId,
    serviceId: configuration.groupId,
    configuration,
  };
}

/** 公開閲覧は維持しつつ、非公開サービスは既存参加者だけに表示する。 */
export async function resolveVisitorServiceContext(slug: string, actorUserId: string | null) {
  if (actorUserId !== null) {
    try {
      return await resolveMemberServiceContext(slug, actorUserId);
    } catch (error) {
      if (!isRouteNotFound(error)) throw error;
    }
  }
  return resolvePublicServiceContext(slug);
}

export async function resolveManagedServiceContext(
  slug: string,
  actorUserId: string,
  permission: ServiceManagementPermission = 'ADMINISTRATION',
): Promise<ManagedServiceContext> {
  if (slug.length > 80 || !SERVICE_SLUG.test(slug))
    throw new ApplicationError('NOT_FOUND', 'service not found');
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
  const storedConfiguration = await new ServiceFoundationService(
    new db.PrismaServiceFoundationRepository(),
  ).findByGroup({ ...target, actorUserId });
  const configuration = effectiveServiceConfiguration(storedConfiguration);
  return {
    workspaceId: configuration.workspaceId,
    serviceId: configuration.groupId,
    configuration,
    serviceRole: serviceRole as ServiceContentRole,
  };
}
