import 'server-only';
import { EXTERNAL_READ_CONSENT_VERSION, type ExternalGrantOwner } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import type { ExternalGrantOwnerView } from '../external-read-grant-view';
import { externalReadClientCatalog } from './external-read-client-catalog';

export async function externalReadGrantOwner(slug: string, bunshinId: string, actorUserId: string) {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length > 80 ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(bunshinId)
  )
    throw new ApplicationError('NOT_FOUND', 'external grant owner unavailable');
  const db = await import('@bunshin/database');
  const configuration = await db.prisma.serviceConfiguration.findUnique({
    where: { slug },
    select: { workspaceId: true, groupId: true, displayName: true },
  });
  if (!configuration) throw new ApplicationError('NOT_FOUND', 'external grant owner unavailable');
  const [member, bunshin] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: configuration.workspaceId,
        groupId: configuration.groupId,
        userId: actorUserId,
      },
      select: { id: true },
    }),
    db.prisma.bunshin.findFirst({
      where: {
        id: bunshinId,
        workspaceId: configuration.workspaceId,
        groupId: configuration.groupId,
        ownerUserId: actorUserId,
      },
      select: { id: true, name: true },
    }),
  ]);
  if (!member || !bunshin)
    throw new ApplicationError('NOT_FOUND', 'external grant owner unavailable');
  const owner: ExternalGrantOwner = {
    actorUserId,
    scope: {
      workspaceId: configuration.workspaceId,
      serviceId: configuration.groupId,
      groupMembershipId: member.id,
      userId: actorUserId,
      bunshinId: bunshin.id,
    },
  };
  return { owner, targetName: bunshin.name, serviceName: configuration.displayName };
}
export type ExternalGrantOwnerTarget = Awaited<ReturnType<typeof externalReadGrantOwner>>;
export async function externalGrantOwnerManager() {
  const db = await import('@bunshin/database');
  const env = getServerEnvironment().APP_ENV;
  if (env === 'staging') return null; // Never reinterpret unsupported staging as development/production.
  const clients = externalReadClientCatalog();
  return new db.PrismaExternalReadGrantRepository(db.prisma, env, () => ({
    enabled: clients.length > 0,
    clients: clients.map((c) => c.id),
  }));
}
export async function externalGrantOwnerView(
  target: ExternalGrantOwnerTarget,
): Promise<ExternalGrantOwnerView> {
  const manager = await externalGrantOwnerManager();
  if (!manager)
    return {
      version: 'external-grant-owner-v1',
      consentVersion: EXTERNAL_READ_CONSENT_VERSION,
      targetName: target.targetName,
      managementAvailable: false,
      clients: [],
      grants: [],
    };
  const catalog = externalReadClientCatalog();
  if (catalog.length > 10)
    throw new ApplicationError('CONFIGURATION_ERROR', 'invalid external read catalog');
  const [grants, available] = await Promise.all([
    manager.list(target.owner),
    Promise.all(
      catalog.map(async (client) => ({
        client,
        allowed: await manager.issuanceAllowed(target.owner, client.id),
      })),
    ),
  ]);
  const at = Date.now();
  return {
    version: 'external-grant-owner-v1',
    consentVersion: EXTERNAL_READ_CONSENT_VERSION,
    targetName: target.targetName,
    managementAvailable: true,
    clients: available.filter((c) => c.allowed).map((c) => ({ ...c.client })),
    grants: grants.map((grant) => ({
      id: grant.connectionId,
      clientName: catalog.find((c) => c.id === grant.clientId)?.name ?? '登録済みの接続先',
      revision: grant.revision,
      state: grant.revokedAt ? 'REVOKED' : grant.expiresAt.getTime() <= at ? 'EXPIRED' : 'ACTIVE',
      grantedAt: grant.grantedAt.toISOString(),
      expiresAt: grant.expiresAt.toISOString(),
    })),
  };
}
