import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { readServiceOnboardingSettings } from '../../../../../src/services/service-onboarding-settings';

export type GroupMembersSearchParams = {
  member?: string;
  saved?: string;
  memberSaved?: string;
  staffSaved?: string;
  approved?: string;
  error?: string;
  service?: string;
};

export async function loadGroupMembersPage({
  groupId: rawGroupId,
  query,
}: {
  groupId: string;
  query: GroupMembersSearchParams;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const groupId = z.uuid().safeParse(rawGroupId);
  if (!groupId.success) notFound();
  const db = await import('@bunshin/database');
  const now = new Date();
  const localDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const localMonth = localDate.slice(0, 7);
  const groupScope = await db.prisma.group.findFirst({
    where: { id: groupId.data, status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    select: { workspaceId: true },
  });
  if (!groupScope) notFound();
  const [manager, workspaceManager, platformAdmin] = await Promise.all([
    db.prisma.groupMembership.findFirst({
      where: { groupId: groupId.data, userId: actor.userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { id: true, serviceRole: true },
    }),
    db.prisma.workspaceMembership.findFirst({
      where: {
        workspaceId: groupScope.workspaceId,
        userId: actor.userId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN'] },
      },
      select: { id: true, role: true },
    }),
    db.prisma.platformAdmin.findFirst({
      where: {
        userId: actor.userId,
        status: 'ACTIVE',
        role: { in: ['SUPER_ADMIN', 'OPERATOR'] },
      },
      select: { id: true, role: true },
    }),
  ]);
  if (!manager && !workspaceManager && !platformAdmin) notFound();
  const elevated = Boolean(workspaceManager || platformAdmin);
  const canManageStaff =
    manager?.serviceRole === 'SERVICE_OWNER' || platformAdmin?.role === 'SUPER_ADMIN';

  const group = await db.prisma.group.findFirst({
    where: { id: groupId.data, workspaceId: groupScope.workspaceId, status: 'ACTIVE' },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      serviceConfiguration: { select: { id: true } },
      serviceRegistrationPolicy: { select: { onboardingConfig: true, surveyConfig: true } },
      workspace: { select: { name: true } },
      memberships: {
        select: {
          id: true,
          role: true,
          serviceRole: true,
          status: true,
          consentedAt: true,
          lastUsedAt: true,
          user: { select: { displayName: true, email: true } },
          serviceMemberBusinessProfile: { select: { businessName: true } },
          serviceOnboardingResponse: { select: { completedAt: true } },
          featureAssignments: true,
        },
        orderBy: { user: { displayName: 'asc' } },
      },
      featurePolicies: {
        where: { status: 'ENABLED', feature: { status: 'ACTIVE' } },
        include: { feature: true },
        orderBy: { featureKey: 'asc' },
      },
      featureAudits: {
        where: { action: 'MEMBER_ASSIGNMENT_SET' },
        include: {
          groupMembership: { select: { user: { select: { displayName: true } } } },
          performedByUser: { select: { displayName: true } },
          feature: { select: { name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      },
      membershipAudits: {
        include: {
          groupMembership: { select: { user: { select: { displayName: true } } } },
          performedByUser: { select: { displayName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 30,
      },
      featureUsageEvents: {
        where: { localMonth },
        select: { groupMembershipId: true, featureKey: true, localDate: true },
      },
    },
  });
  if (!group) notFound();

  const onboardingSettings = readServiceOnboardingSettings(
    group.serviceRegistrationPolicy?.onboardingConfig,
    group.serviceRegistrationPolicy?.surveyConfig,
  );
  const onboardingRequired = onboardingSettings.questions.length > 0;
  const selectedMember =
    group.memberships.find(
      (item) => item.id === query.member && item.status !== 'PENDING_APPROVAL',
    ) ?? group.memberships.find((item) => item.status !== 'PENDING_APPROVAL');
  const pendingMemberships = group.memberships.filter(
    (membership) => membership.status === 'PENDING_APPROVAL',
  );
  const activeMemberships = group.memberships.filter(
    (membership) => membership.status === 'ACTIVE',
  );
  const activeOperators = activeMemberships.filter((membership) =>
    group.serviceConfiguration
      ? membership.serviceRole !== 'PARTICIPANT'
      : membership.role === 'MANAGER',
  );
  const rewardsPilotCount = activeMemberships.filter(
    (membership) => membership.serviceRole === 'PARTICIPANT' && membership.consentedAt,
  ).length;
  const assignments = new Map(
    (selectedMember?.featureAssignments ?? []).map((item) => [item.featureKey, item]),
  );
  const selectedUsage = selectedMember
    ? group.featureUsageEvents.filter((event) => event.groupMembershipId === selectedMember.id)
    : [];

  return {
    group,
    query,
    selectedMember,
    pendingMemberships,
    activeMemberships,
    activeOperators,
    rewardsPilotCount,
    assignments,
    selectedUsage,
    localDate,
    onboardingRequired,
    elevated,
    canManageStaff,
  };
}

export type GroupMembersPageModel = Awaited<ReturnType<typeof loadGroupMembersPage>>;
