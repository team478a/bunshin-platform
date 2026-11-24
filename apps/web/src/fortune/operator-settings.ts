import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import type { FortuneAppearanceSettings } from './appearance';
import type { FortuneGuidanceSettings } from './guidance-settings';
import { fortuneOperatorScope } from './operator-scope';
import { fortuneOperatorStatus } from './operator-status';

export async function setFortuneEnabled(input: {
  serviceSlug: string;
  actorUserId: string;
  enabled: boolean;
}) {
  const status = await fortuneOperatorStatus(input.serviceSlug, input.actorUserId);
  if (!status.configured) throw new ApplicationError('CONFLICT', 'fortune is not configured');
  if (input.enabled && !status.canEnable)
    throw new ApplicationError('CONFLICT', 'fortune launch requirements are incomplete');
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.fortuneServiceSetting.updateMany({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    data: { enabled: input.enabled },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return { enabled: input.enabled };
}

export async function saveFortuneGuidanceSettings(input: {
  serviceSlug: string;
  actorUserId: string;
  settings: FortuneGuidanceSettings;
}) {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.$executeRaw`
    UPDATE fortune_service_settings
    SET guidance_settings =
      CASE WHEN jsonb_typeof(guidance_settings->'basicProfile') = 'object'
        THEN jsonb_build_object('basicProfile', guidance_settings->'basicProfile')
        ELSE '{}'::jsonb
      END || ${JSON.stringify(input.settings)}::jsonb ||
      CASE WHEN jsonb_typeof(guidance_settings->'appearance') = 'object'
        THEN jsonb_build_object('appearance', guidance_settings->'appearance')
        ELSE '{}'::jsonb
      END,
      updated_at = NOW()
    WHERE workspace_id = ${service.workspaceId}::uuid
      AND group_id = ${service.serviceId}::uuid
      AND configuration_id = ${service.configuration.id}::uuid
  `;
  if (updated !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return { saved: true };
}

export async function saveFortuneAppearanceSettings(input: {
  serviceSlug: string;
  actorUserId: string;
  settings: FortuneAppearanceSettings;
}) {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.$executeRaw`
    UPDATE fortune_service_settings
    SET guidance_settings = jsonb_set(
      CASE WHEN jsonb_typeof(guidance_settings) = 'object' THEN guidance_settings ELSE '{}'::jsonb END,
      '{appearance}', ${JSON.stringify(input.settings)}::jsonb
    ), updated_at = NOW()
    WHERE workspace_id = ${service.workspaceId}::uuid
      AND group_id = ${service.serviceId}::uuid
      AND configuration_id = ${service.configuration.id}::uuid
  `;
  if (updated !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return { saved: true };
}

export async function setFortuneGuidanceSetting(input: {
  field: 'personalProfileEnabled' | 'reflectionEnabled';
  serviceSlug: string;
  actorUserId: string;
  enabled: boolean;
}) {
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.fortuneServiceSetting.updateMany({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      configurationId: service.configuration.id,
    },
    data: { [input.field]: input.enabled },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return { [input.field]: input.enabled };
}

export async function setFortuneAiEnabled(input: {
  serviceSlug: string;
  actorUserId: string;
  enabled: boolean;
}) {
  const status = await fortuneOperatorStatus(input.serviceSlug, input.actorUserId);
  if (!status.configured) throw new ApplicationError('CONFLICT', 'fortune is not configured');
  if (input.enabled) {
    if (!status.enabled)
      throw new ApplicationError('CONFLICT', 'publish fortune before enabling AI');
    const { resolveOpenAiRuntimeConfiguration } =
      await import('../ai/runtime-provider-configuration');
    await resolveOpenAiRuntimeConfiguration(undefined, 'FORTUNE');
  }
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.fortuneServiceSetting.updateMany({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    data: { aiEnabled: input.enabled },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return { aiEnabled: input.enabled };
}

export async function setFortuneWeeklyNotification(input: {
  serviceSlug: string;
  actorUserId: string;
  enabled: boolean;
  weekday: number;
  hour: number;
}) {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6)
    throw new ApplicationError('VALIDATION_ERROR', 'weekday must be between 0 and 6');
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23)
    throw new ApplicationError('VALIDATION_ERROR', 'hour must be between 0 and 23');
  const status = await fortuneOperatorStatus(input.serviceSlug, input.actorUserId);
  if (!status.configured) throw new ApplicationError('CONFLICT', 'fortune is not configured');
  if (input.enabled && (!status.enabled || !status.lineReady))
    throw new ApplicationError(
      'CONFLICT',
      'publish fortune and complete LINE setup before enabling notifications',
    );
  const service = await fortuneOperatorScope(input.serviceSlug, input.actorUserId);
  const db = await import('@bunshin/database');
  const updated = await db.prisma.fortuneServiceSetting.updateMany({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    data: {
      weeklyNotificationEnabled: input.enabled,
      weeklyNotificationDay: input.weekday,
      weeklyNotificationHour: input.hour,
    },
  });
  if (updated.count !== 1) throw new ApplicationError('NOT_FOUND', 'fortune setting not found');
  return {
    weeklyNotificationEnabled: input.enabled,
    weeklyNotificationDay: input.weekday,
    weeklyNotificationHour: input.hour,
  };
}
