import 'server-only';
import type {
  LineConfigurationEnvironment,
  LineDeliveryConfigurationPort,
} from '@bunshin/application';
import { prisma } from '@bunshin/database';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from './secure-configuration';

export class ActiveLineDeliveryConfigurationAdapter implements LineDeliveryConfigurationPort {
  constructor(private readonly crypto = new AesGcmLineSecretCrypto()) {}

  async getActive(environment: LineConfigurationEnvironment) {
    if (environment !== currentLineEnvironment()) return null;
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
