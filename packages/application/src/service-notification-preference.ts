import { ApplicationError } from '@bunshin/shared';

export const SERVICE_NOTIFICATION_CHANNELS = ['LINE', 'EMAIL'] as const;
export type ServiceNotificationChannel = (typeof SERVICE_NOTIFICATION_CHANNELS)[number];

export interface ServiceNotificationPreference {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  userId: string;
  topic: string;
  channel: ServiceNotificationChannel;
  enabled: boolean;
  consentedAt: Date | null;
  optedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceNotificationPreferenceRepository {
  get(input: {
    slug: string;
    actorUserId: string;
    topic: string;
    channel: ServiceNotificationChannel;
    now: Date;
  }): Promise<{ accessible: boolean; preference: ServiceNotificationPreference | null }>;
  upsert(input: {
    slug: string;
    actorUserId: string;
    topic: string;
    channel: ServiceNotificationChannel;
    enabled: boolean;
    now: Date;
  }): Promise<ServiceNotificationPreference | null>;
}

const slug = (value: string) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid service slug');
  return value;
};

const topic = (value: string) => {
  if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid notification topic');
  return value;
};

const channel = (value: ServiceNotificationChannel) => {
  if (!SERVICE_NOTIFICATION_CHANNELS.includes(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid notification channel');
  return value;
};

export class ServiceNotificationPreferenceService {
  constructor(private readonly repository: ServiceNotificationPreferenceRepository) {}

  async get(input: {
    slug: string;
    actorUserId: string;
    topic: string;
    channel: ServiceNotificationChannel;
    now?: Date;
  }) {
    const normalized = {
      ...input,
      slug: slug(input.slug),
      topic: topic(input.topic),
      channel: channel(input.channel),
      now: input.now ?? new Date(),
    };
    const result = await this.repository.get(normalized);
    if (!result.accessible)
      throw new ApplicationError('FORBIDDEN', 'active service membership required');
    return result.preference;
  }

  async update(input: {
    slug: string;
    actorUserId: string;
    topic: string;
    channel: ServiceNotificationChannel;
    enabled: boolean;
    now?: Date;
  }) {
    const result = await this.repository.upsert({
      ...input,
      slug: slug(input.slug),
      topic: topic(input.topic),
      channel: channel(input.channel),
      now: input.now ?? new Date(),
    });
    if (result === null)
      throw new ApplicationError('FORBIDDEN', 'active service membership required');
    return result;
  }
}
