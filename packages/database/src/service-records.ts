import type { ServiceFoundationRecord } from '@bunshin/application';
import type { Group, GroupInvitation, GroupMembership } from '@bunshin/platform-domain';
import type { Prisma } from './client';
export const groupRecord = (row: Prisma.GroupGetPayload<object>): Group => ({ ...row });
export const groupMembershipRecord = (
  row: Prisma.GroupMembershipGetPayload<object>,
): GroupMembership => ({
  ...row,
});
export const groupInvitationRecord = (
  row: Prisma.GroupInvitationGetPayload<object>,
): GroupInvitation => ({ ...row });

export const serviceFoundationRecord = (
  row: Prisma.ServiceConfigurationGetPayload<{ include: { brand: true; registration: true } }>,
): ServiceFoundationRecord => {
  if (row.brand === null || row.registration === null)
    throw new Error('service foundation aggregate is incomplete');
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    operatorName: row.operatorName,
    contactEmail: row.contactEmail,
    visibility: row.visibility,
    poweredByEnabled: row.poweredByEnabled,
    trendResearchEnabled: row.trendResearchEnabled,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    termsUrl: row.termsUrl,
    privacyUrl: row.privacyUrl,
    brand: {
      logoUrl: row.brand.logoUrl,
      iconUrl: row.brand.iconUrl,
      faviconUrl: row.brand.faviconUrl,
      primaryColor: row.brand.primaryColor,
      secondaryColor: row.brand.secondaryColor,
      fontFamily: row.brand.fontFamily,
    },
    registration: {
      mode: row.registration.mode,
      emailEnabled: row.registration.emailEnabled,
      lineEnabled: row.registration.lineEnabled,
      inviteCodeEnabled: row.registration.inviteCodeEnabled,
      referralEnabled: row.registration.referralEnabled,
      onboardingConfig: row.registration.onboardingConfig,
      surveyConfig: row.registration.surveyConfig,
    },
  };
};

export const serviceStaffRoleRecord = (row: {
  id: string;
  workspaceId: string;
  groupId: string;
  userId: string;
  serviceRole: 'SERVICE_OWNER' | 'SERVICE_ADMIN' | 'CONTENT_EDITOR' | 'PARTICIPANT';
  status: string;
}) => ({
  membershipId: row.id,
  workspaceId: row.workspaceId,
  groupId: row.groupId,
  userId: row.userId,
  serviceRole: row.serviceRole,
  status: row.status as 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
});
