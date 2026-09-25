import type { ServiceFoundationRepository } from '@bunshin/application';
import type { PrismaClient } from './client';
import { serviceFoundationRecord } from './service-records';

export async function findServiceFoundationByGroup(
  client: PrismaClient,
  input: Parameters<ServiceFoundationRepository['findByGroup']>[0],
) {
  const [platformAdmin, access] = await Promise.all([
    client.platformAdmin.findFirst({
      where: { userId: input.actorUserId, status: 'ACTIVE' },
      select: { id: true },
    }),
    client.group.findFirst({
      where: {
        id: input.groupId,
        workspaceId: input.workspaceId,
        OR: [
          {
            memberships: {
              some: { userId: input.actorUserId, role: 'MANAGER', status: 'ACTIVE' },
            },
          },
          {
            workspace: {
              memberships: {
                some: {
                  userId: input.actorUserId,
                  role: { in: ['OWNER', 'ADMIN'] },
                  status: 'ACTIVE',
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (platformAdmin === null && access === null) return null;
  const value = await client.serviceConfiguration.findFirst({
    where: { workspaceId: input.workspaceId, groupId: input.groupId },
    include: { brand: true, registration: true },
  });
  return value === null ? null : serviceFoundationRecord(value);
}

export async function findPublicServiceFoundationBySlug(
  client: PrismaClient,
  input: Parameters<ServiceFoundationRepository['findPublicBySlug']>[0],
) {
  const value = await client.serviceConfiguration.findFirst({
    where: {
      slug: input.slug,
      visibility: 'PUBLIC',
      group: { status: 'ACTIVE' },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
      ],
    },
    include: { brand: true, registration: true },
  });
  return value === null ? null : serviceFoundationRecord(value);
}

export async function findMemberServiceFoundationBySlug(
  client: PrismaClient,
  input: Parameters<ServiceFoundationRepository['findMemberBySlug']>[0],
) {
  const value = await client.serviceConfiguration.findFirst({
    where: {
      slug: input.slug,
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        memberships: {
          some: { userId: input.actorUserId, status: 'ACTIVE' },
        },
      },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: input.now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: input.now } }] },
      ],
    },
    include: { brand: true, registration: true },
  });
  return value === null ? null : serviceFoundationRecord(value);
}
