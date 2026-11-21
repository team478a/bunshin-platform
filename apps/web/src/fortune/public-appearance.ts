import 'server-only';
import type { ServiceFoundationRecord } from '@bunshin/application';
import { createLogger } from '@bunshin/observability';
import { z } from 'zod';
import { isFortuneServicePackage } from '../services/service-creation-templates';
import { fortuneAppearanceSchema } from './appearance';

const logger = createLogger();
const appearanceFromGuidance = z.object({ appearance: fortuneAppearanceSchema.optional() });

export async function publicFortuneAppearance(configuration: ServiceFoundationRecord) {
  if (
    configuration.visibility !== 'PUBLIC' ||
    !isFortuneServicePackage(configuration.registration.onboardingConfig)
  )
    return undefined;
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
  return appearanceFromGuidance.safeParse(setting?.guidanceSettings).data?.appearance;
}
