import {
  effectiveServiceContentAssistanceLevel,
  readServiceOnboardingSettings,
  serviceDeliveryDefaultAssistanceLevel,
  type ServiceContentAssistanceLevel,
} from './service-onboarding-settings';
import type { ServiceGenerationKnowledgeScope } from './service-generation-knowledge-types';

export async function resolveServiceContentAssistanceLevel(
  scope: ServiceGenerationKnowledgeScope,
): Promise<ServiceContentAssistanceLevel | null> {
  const db = await import('@bunshin/database');
  const [registrationPolicy, membership] = await Promise.all([
    db.prisma.serviceRegistrationPolicy.findFirst({
      where: { workspaceId: scope.workspaceId, groupId: scope.groupId },
      select: { onboardingConfig: true, surveyConfig: true },
    }),
    db.prisma.groupMembership.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
  ]);
  if (membership) {
    const now = new Date();
    const enrollment = await db.prisma.programEnrollment.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: membership.id,
        status: 'ACTIVE',
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, supportMode: true },
    });
    if (enrollment) {
      const preference = await db.prisma.programMemberPreference.findUnique({
        where: { programEnrollmentId: enrollment.id },
        select: { preferredSupportMode: true },
      });
      return effectiveServiceContentAssistanceLevel({
        contentMode: readServiceOnboardingSettings(
          registrationPolicy?.onboardingConfig,
          registrationPolicy?.surveyConfig,
        ).dailyIdeaDelivery.contentMode,
        enrollmentSupportMode: enrollment.supportMode,
        ...(preference ? { preferredSupportMode: preference.preferredSupportMode } : {}),
      });
    }
  }
  const dailyDelivery = readServiceOnboardingSettings(
    registrationPolicy?.onboardingConfig,
    registrationPolicy?.surveyConfig,
  ).dailyIdeaDelivery;
  return serviceDeliveryDefaultAssistanceLevel(dailyDelivery);
}
