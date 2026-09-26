import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './configuration-environment';

export const SERVICE_LINE_BROADCAST_PURPOSES = [
  'ATTRACT',
  'RESERVATION',
  'SALES',
  'RECRUITING',
  'AWARENESS',
  'RETENTION',
] as const;

export type ServiceLineBroadcastPurpose = (typeof SERVICE_LINE_BROADCAST_PURPOSES)[number];

export interface ServiceLineBroadcastSegment {
  industryIds: string[];
  purposes: ServiceLineBroadcastPurpose[];
}

export type ScheduleServiceLineBroadcastResult =
  | { kind: 'SCHEDULED'; broadcastId: string; recipientCount: number; scheduledAt: Date }
  | {
      kind:
        'ACCESS_DENIED' | 'CONFIGURATION_UNAVAILABLE' | 'NO_RECIPIENTS' | 'RECIPIENT_COUNT_CHANGED';
    };

export interface ServiceLineBroadcastAudienceRepository {
  preview(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    segment: ServiceLineBroadcastSegment;
  }): Promise<{ recipientCount: number; capped: boolean } | null>;
  schedule(input: {
    environment: LineConfigurationEnvironment;
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    title: string;
    message: string;
    reason: string;
    scheduledAt: Date;
    expectedRecipientCount: number;
    segment: ServiceLineBroadcastSegment;
  }): Promise<ScheduleServiceLineBroadcastResult>;
}

const required = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

function segment(input: ServiceLineBroadcastSegment): ServiceLineBroadcastSegment {
  if (
    input.industryIds.length > 20 ||
    input.purposes.length > SERVICE_LINE_BROADCAST_PURPOSES.length ||
    input.purposes.some((purpose) => !SERVICE_LINE_BROADCAST_PURPOSES.includes(purpose))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid broadcast segment');
  return {
    industryIds: [...new Set(input.industryIds)],
    purposes: [...new Set(input.purposes)],
  };
}

export class ServiceLineBroadcastAudienceService {
  constructor(
    private readonly repository: ServiceLineBroadcastAudienceRepository,
    private readonly now = () => new Date(),
  ) {}

  async preview(input: Parameters<ServiceLineBroadcastAudienceRepository['preview']>[0]) {
    const result = await this.repository.preview({ ...input, segment: segment(input.segment) });
    if (!result) throw new ApplicationError('FORBIDDEN', 'service broadcast preview denied');
    return result;
  }

  async schedule(input: Parameters<ServiceLineBroadcastAudienceRepository['schedule']>[0]) {
    if (
      !Number.isInteger(input.expectedRecipientCount) ||
      input.expectedRecipientCount < 1 ||
      input.expectedRecipientCount > 500
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expected recipient count');
    if (
      Number.isNaN(input.scheduledAt.getTime()) ||
      input.scheduledAt.getTime() < this.now().getTime() - 5_000
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid scheduledAt');

    const result = await this.repository.schedule({
      ...input,
      title: required(input.title, 'title', 120),
      message: required(input.message, 'message', 5_000),
      reason: required(input.reason, 'reason', 1_000),
      segment: segment(input.segment),
    });
    if (result.kind === 'SCHEDULED') return result;
    if (result.kind === 'ACCESS_DENIED')
      throw new ApplicationError('FORBIDDEN', 'service broadcast scheduling denied');
    if (result.kind === 'CONFIGURATION_UNAVAILABLE')
      throw new ApplicationError('CONFLICT', 'active service LINE configuration required');
    if (result.kind === 'NO_RECIPIENTS')
      throw new ApplicationError('CONFLICT', 'no eligible LINE recipients');
    throw new ApplicationError(
      'CONFLICT',
      'recipient count changed; preview and confirm the audience again',
    );
  }
}
