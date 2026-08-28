import 'server-only';
import type {
  LineConfigurationEnvironment,
  LineDeliveryConfigurationPort,
} from '@bunshin/application';
import { prisma } from '@bunshin/database';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from './secure-configuration';

export class ActiveLineDeliveryConfigurationAdapter implements LineDeliveryConfigurationPort {
  constructor(private readonly crypto = new AesGcmLineSecretCrypto()) {}

  async getActive(
    environment: LineConfigurationEnvironment,
    scope?: { workspaceId: string; groupId: string | null; userId: string },
  ) {
    if (environment !== currentLineEnvironment()) return null;
    if (scope?.groupId) {
      const policy = await prisma.groupLineRoutingPolicy.findUnique({
        where: {
          workspaceId_groupId_environment: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            environment,
          },
        },
      });
      if (policy?.mode === 'DISABLED') return null;
      if (policy?.mode === 'DEDICATED') {
        if (!policy.pilotEnabled) return null;
        const membership = await prisma.groupMembership.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            userId: scope.userId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            group: { status: 'ACTIVE' },
          },
          select: { id: true },
        });
        if (!membership) return null;
        const dedicated = await prisma.groupLineChannelConfiguration.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            environment,
            status: 'ACTIVE',
            lastVerifiedAt: { not: null },
            lastErrorCategory: null,
          },
        });
        if (!dedicated) return null;
        return {
          environment: dedicated.environment,
          accessToken: this.crypto.decrypt(dedicated.encryptedAccessToken),
          globallyPaused: dedicated.globallyPaused,
          quotaWarningPercent: dedicated.quotaWarningPercent,
          quotaLowPriorityStop: dedicated.quotaLowPriorityStop,
        };
      }
    }
    const row = await prisma.lineChannelConfiguration.findFirst({
      where: {
        environment,
        status: 'ACTIVE',
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
      },
    });
    if (!row) return null;
    return {
      environment: row.environment,
      accessToken: this.crypto.decrypt(row.encryptedAccessToken),
      globallyPaused: row.globallyPaused,
      quotaWarningPercent: row.quotaWarningPercent,
      quotaLowPriorityStop: row.quotaLowPriorityStop,
    };
  }
}
