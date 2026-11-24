import 'server-only';
import type { ServiceFoundationRecord } from '@bunshin/application';
import { createLogger } from '@bunshin/observability';
import { ORACLE_SERVICE_SLUG } from '../services/service-auth-brand';
import { isFortuneServicePackage } from '../services/service-creation-templates';
import { readFortuneAppearance, resolveFortunePageAppearance } from './appearance';

const logger = createLogger();

export function hasFortuneEntryTheme(configuration: ServiceFoundationRecord) {
  return (
    configuration.slug === ORACLE_SERVICE_SLUG ||
    isFortuneServicePackage(configuration.registration?.onboardingConfig)
  );
}

export async function publicFortuneAppearance(configuration: ServiceFoundationRecord) {
  if (configuration.visibility !== 'PUBLIC' || !hasFortuneEntryTheme(configuration)) {
    return undefined;
  }
  return fortuneEntryAppearance(configuration);
}

export async function fortuneEntryAppearance(configuration: ServiceFoundationRecord) {
  const db = await import('@bunshin/database');
  const setting = await db.prisma.fortuneServiceSetting
    .findFirst({
      where: {
        configurationId: configuration.id,
        groupId: configuration.groupId,
        workspaceId: configuration.workspaceId,
      },
      select: { guidanceSettings: true },
    })
    .catch(() => {
      logger.warn('fortune public appearance unavailable');
      return null;
    });
  return setting || hasFortuneEntryTheme(configuration)
    ? resolveFortunePageAppearance(readFortuneAppearance(setting?.guidanceSettings), true)
    : undefined;
}
