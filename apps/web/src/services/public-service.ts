import 'server-only';
import { ServiceFoundationService, type ServiceFoundationRecord } from '@bunshin/application';

const SERVICE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PublicServiceContext {
  workspaceId: string;
  serviceId: string;
  configuration: ServiceFoundationRecord;
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
