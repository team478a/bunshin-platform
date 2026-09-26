import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export type GroupBadgesSearchParams = {
  created?: string;
  nominated?: string;
  reviewed?: string;
  revoked?: string;
  availability?: string;
  revised?: string;
  error?: string;
  service?: string;
};

export async function loadGroupBadgesPage({
  groupId: rawGroupId,
  query,
}: {
  groupId: string;
  query: GroupBadgesSearchParams;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse(rawGroupId);
  if (!groupId.success) notFound();
  const db = await import('@bunshin/database');
  const group = await db.prisma.group.findFirst({
    where: {
      id: groupId.data,
      status: 'ACTIVE',
      memberships: { some: { userId: actor.userId, role: 'MANAGER', status: 'ACTIVE' } },
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      memberships: {
        where: { status: 'ACTIVE' },
        select: {
          userId: true,
          serviceRole: true,
          user: { select: { displayName: true, email: true } },
        },
        orderBy: { user: { displayName: 'asc' } },
      },
    },
  });
  if (!group) notFound();
  const [definitions, candidates, activeAwards] = await Promise.all([
    db.prisma.badgeDefinition.findMany({
      where: { workspaceId: group.workspaceId, groupId: group.id, ownerType: 'GROUP' },
      include: {
        versions: { include: { approvalRequests: true }, orderBy: { version: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.prisma.badgeAwardCandidate.findMany({
      where: { workspaceId: group.workspaceId, groupId: group.id },
      include: {
        user: { select: { displayName: true } },
        nominatedBy: { select: { displayName: true } },
        badgeVersion: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.prisma.badgeAward.findMany({
      where: {
        workspaceId: group.workspaceId,
        groupId: group.id,
        status: 'ACTIVE',
        sourceType: 'GROUP_APPROVAL',
        badgeVersion: {
          definition: { ownerType: 'GROUP', workspaceId: group.workspaceId, groupId: group.id },
        },
      },
      select: {
        id: true,
        awardedAt: true,
        user: { select: { displayName: true, email: true } },
        badgeVersion: { select: { title: true } },
      },
      orderBy: { awardedAt: 'desc' },
      take: 100,
    }),
  ]);
  const activeVersions = definitions.flatMap((definition) =>
    definition.status === 'ACTIVE'
      ? definition.versions.filter((version) => version.publishedAt !== null)
      : [],
  );
  const serviceOperator = group.memberships.some(
    (membership) =>
      membership.userId === actor.userId &&
      (membership.serviceRole === 'SERVICE_OWNER' || membership.serviceRole === 'SERVICE_ADMIN'),
  );
  const awardableMemberships = serviceOperator
    ? group.memberships.filter((membership) => membership.userId !== actor.userId)
    : group.memberships;

  return {
    group,
    definitions,
    candidates,
    activeAwards,
    activeVersions,
    query,
    serviceOperator,
    awardableMemberships,
  };
}

export type GroupBadgesPageModel = Awaited<ReturnType<typeof loadGroupBadgesPage>>;
