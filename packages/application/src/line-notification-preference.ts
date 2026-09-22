import { ApplicationError } from '@bunshin/shared';

export const LINE_NOTIFICATION_FREQUENCIES = ['DAILY', 'WEEKDAYS'] as const;
export type LineNotificationFrequency = (typeof LINE_NOTIFICATION_FREQUENCIES)[number];

export interface LineNotificationPreference {
  id: string;
  workspaceId: string;
  userId: string;
  bunshinId: string;
  enabled: boolean;
  notificationConsentAt: Date | null;
  localTime: string;
  timezone: string;
  frequency: LineNotificationFrequency;
  quietHoursStart: string;
  quietHoursEnd: string;
  pausedUntil: Date | null;
  reminderEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineNotificationPreferenceRepository {
  getScoped(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<{ accessible: boolean; preference: LineNotificationPreference | null }>;
  upsert(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    enabled: boolean;
    consentGranted: boolean;
    localTime: string;
    timezone: string;
    frequency: LineNotificationFrequency;
    quietHoursStart: string;
    quietHoursEnd: string;
    pausedUntil: Date | null;
    reminderEnabled: boolean;
  }): Promise<LineNotificationPreference | null>;
}

export const defaultLineNotificationPreference = (input: {
  workspaceId: string;
  userId: string;
  bunshinId: string;
}): LineNotificationPreference => ({
  id: '',
  ...input,
  enabled: false,
  notificationConsentAt: null,
  localTime: '08:00',
  timezone: 'Asia/Tokyo',
  frequency: 'DAILY',
  quietHoursStart: '21:00',
  quietHoursEnd: '07:00',
  pausedUntil: null,
  reminderEnabled: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

function validateLineNotificationPreference(input: {
  enabled: boolean;
  consentGranted: boolean;
  localTime: string;
  timezone: string;
  frequency: LineNotificationFrequency;
  quietHoursStart: string;
  quietHoursEnd: string;
  pausedUntil: Date | null;
}) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (![input.localTime, input.quietHoursStart, input.quietHoursEnd].every((v) => time.test(v)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid notification time');
  if (input.quietHoursStart === input.quietHoursEnd)
    throw new ApplicationError('VALIDATION_ERROR', 'quiet hours must have a duration');
  if (!LINE_NOTIFICATION_FREQUENCIES.includes(input.frequency))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid notification frequency');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format();
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone', error);
  }
  if (input.enabled && !input.consentGranted)
    throw new ApplicationError('VALIDATION_ERROR', 'notification consent is required');
  if (input.pausedUntil !== null && Number.isNaN(input.pausedUntil.getTime()))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid pause date');
}

export class GetLineNotificationPreference {
  constructor(private readonly repository: LineNotificationPreferenceRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const result = await this.repository.getScoped(input);
    if (!result.accessible) throw new ApplicationError('NOT_FOUND', 'Bunshin not found');
    return (
      result.preference ??
      defaultLineNotificationPreference({
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        bunshinId: input.bunshinId,
      })
    );
  }
}

export class UpdateLineNotificationPreference {
  constructor(private readonly repository: LineNotificationPreferenceRepository) {}
  async execute(input: Parameters<LineNotificationPreferenceRepository['upsert']>[0]) {
    validateLineNotificationPreference(input);
    const result = await this.repository.upsert(input);
    if (!result) throw new ApplicationError('NOT_FOUND', 'Bunshin not found');
    return result;
  }
}

export function isLineNotificationSuppressed(
  preference: LineNotificationPreference,
  at: Date,
): boolean {
  if (!preference.enabled || preference.notificationConsentAt === null) return true;
  if (preference.pausedUntil && preference.pausedUntil.getTime() > at.getTime()) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: preference.timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (preference.frequency === 'WEEKDAYS' && ['Sat', 'Sun'].includes(value['weekday'] ?? ''))
    return true;
  const local = `${value['hour']}:${value['minute']}`;
  const { quietHoursStart: start, quietHoursEnd: end } = preference;
  return start < end ? local >= start && local < end : local >= start || local < end;
}
