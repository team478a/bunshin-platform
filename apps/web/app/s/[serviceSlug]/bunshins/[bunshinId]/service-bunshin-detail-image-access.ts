import { isPromptOnlyImageService } from '../../../../../src/services/service-image-policy';
import type { PrismaClient } from '@bunshin/database';

type DatabaseModule = { prisma: PrismaClient };

export async function loadServiceImageCreationAvailability(input: {
  db: DatabaseModule;
  serviceSlug: string;
  isBusinessDailyService: boolean;
  workspaceId: string;
  groupId: string;
  actorUserId: string;
}) {
  const promptOnlyImages = isPromptOnlyImageService(input.serviceSlug);
  const membership =
    input.isBusinessDailyService || promptOnlyImages
      ? null
      : await input.db.prisma.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.actorUserId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: {
            featureAssignments: {
              where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
              select: { startsAt: true, endsAt: true },
            },
            group: {
              select: {
                featurePolicies: {
                  where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
                  select: { startsAt: true, endsAt: true },
                },
              },
            },
          },
        });
  const now = new Date();
  const isCurrent = (value: { startsAt: Date | null; endsAt: Date | null }) =>
    (!value.startsAt || value.startsAt <= now) && (!value.endsAt || value.endsAt > now);

  return Boolean(
    !promptOnlyImages &&
    membership?.featureAssignments.some(isCurrent) &&
    membership.group.featurePolicies.some(isCurrent),
  );
}
