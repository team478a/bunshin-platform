import {
  isLineNotificationSuppressed,
  type LineDeliveryPreferencePort,
  type LineNotificationPreference,
} from '@bunshin/application';
import type { Prisma } from './client';
import { type PrismaClient, prisma } from './client';

function lineNotificationPreference(
  row: Prisma.LineNotificationPreferenceGetPayload<object>,
): LineNotificationPreference {
  return row;
}

export class PrismaLineDeliveryPreferenceRepository implements LineDeliveryPreferencePort {
  constructor(private readonly client: PrismaClient = prisma) {}
  async isAllowed(input: Parameters<LineDeliveryPreferencePort['isAllowed']>[0]) {
    const preference = await this.client.lineNotificationPreference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        userId: input.userId,
        workspace: {
          status: 'ACTIVE',
        },
        OR: [
          { workspace: { memberships: { some: { userId: input.userId, status: 'ACTIVE' } } } },
          {
            bunshin: {
              ownerUserId: input.userId,
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: { userId: input.userId, status: 'ACTIVE', consentedAt: { not: null } },
                },
              },
            },
          },
        ],
        bunshin: {
          status: { not: 'ARCHIVED' },
          OR: [
            { groupId: null },
            {
              ownerUserId: input.userId,
              group: {
                status: 'ACTIVE',
                memberships: {
                  some: {
                    userId: input.userId,
                    status: 'ACTIVE',
                    consentedAt: { not: null },
                  },
                },
              },
            },
          ],
        },
        user: { status: 'ACTIVE' },
      },
    });
    return preference
      ? !isLineNotificationSuppressed(lineNotificationPreference(preference), input.at)
      : false;
  }
}
