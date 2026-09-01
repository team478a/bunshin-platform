import { ApplicationError } from '@bunshin/shared';

export const VIDEO_DELIVERY_ACTIONS = [
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'DOWNLOADED',
  'POSTED',
] as const;

export type VideoDeliveryAction = (typeof VIDEO_DELIVERY_ACTIONS)[number];
export type VideoDeliveryStatus =
  'ASSIGNED' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'POSTED' | 'EXPIRED' | 'REVOKED';
export type VideoDeliveryNotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface VideoDeliveryRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  ownerUserId: string;
  programEnrollmentId: string | null;
  videoProjectId: string;
  videoRenderId: string;
  status: VideoDeliveryStatus;
  notificationStatus: VideoDeliveryNotificationStatus;
  notificationErrorCode: string | null;
  notificationAttemptCount: number;
  notifiedAt: Date | null;
  rightsSnapshot: Record<string, unknown>;
  expiresAt: Date | null;
  viewedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  postedAt: Date | null;
  assignedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoDeliveryRepository {
  assign(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    groupMembershipId: string;
    programEnrollmentId: string | null;
    videoProjectId: string;
    videoRenderId: string;
    rightsSnapshot: Record<string, unknown>;
    expiresAt: Date | null;
  }): Promise<VideoDeliveryRecord | null>;
  findForRecipient(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoDeliveryId: string;
  }): Promise<VideoDeliveryRecord | null>;
  recordAction(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoDeliveryId: string;
    action: VideoDeliveryAction;
    eventData: Record<string, unknown>;
  }): Promise<VideoDeliveryRecord | null>;
  recordNotification(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoDeliveryId: string;
    status: Exclude<VideoDeliveryNotificationStatus, 'PENDING'>;
    errorCode: string | null;
    attemptedAt: Date;
  }): Promise<VideoDeliveryRecord | null>;
  revoke(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    videoDeliveryId: string;
    reason: string;
  }): Promise<VideoDeliveryRecord | null>;
}

const object = (value: Record<string, unknown>) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export class AssignVideoDelivery {
  constructor(private readonly repository: VideoDeliveryRepository) {}

  async execute(input: Parameters<VideoDeliveryRepository['assign']>[0]) {
    if (!object(input.rightsSnapshot))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid rights snapshot');
    if (input.expiresAt !== null && input.expiresAt <= new Date())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid delivery expiry');
    const result = await this.repository.assign(input);
    if (result === null) throw new ApplicationError('FORBIDDEN', 'video delivery unavailable');
    return result;
  }
}

export class GetMyVideoDelivery {
  constructor(private readonly repository: VideoDeliveryRepository) {}

  async execute(input: Parameters<VideoDeliveryRepository['findForRecipient']>[0]) {
    const result = await this.repository.findForRecipient(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'video delivery not found');
    return result;
  }
}

export class RecordVideoDeliveryAction {
  constructor(private readonly repository: VideoDeliveryRepository) {}

  async execute(input: Parameters<VideoDeliveryRepository['recordAction']>[0]) {
    if (!VIDEO_DELIVERY_ACTIONS.includes(input.action))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video delivery action');
    if (!object(input.eventData))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video delivery event data');
    const result = await this.repository.recordAction(input);
    if (result === null)
      throw new ApplicationError('FORBIDDEN', 'video delivery action unavailable');
    return result;
  }
}

export class RecordVideoDeliveryNotification {
  constructor(private readonly repository: VideoDeliveryRepository) {}

  async execute(input: Parameters<VideoDeliveryRepository['recordNotification']>[0]) {
    if (
      !['SENT', 'FAILED', 'CANCELLED'].includes(input.status) ||
      (input.status === 'SENT' && input.errorCode !== null) ||
      Number.isNaN(input.attemptedAt.getTime())
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video delivery notification');
    const result = await this.repository.recordNotification(input);
    if (result === null)
      throw new ApplicationError('FORBIDDEN', 'video delivery notification unavailable');
    return result;
  }
}

export class RevokeVideoDelivery {
  constructor(private readonly repository: VideoDeliveryRepository) {}

  async execute(input: Parameters<VideoDeliveryRepository['revoke']>[0]) {
    if (input.reason.trim().length < 1 || input.reason.trim().length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid video delivery revoke reason');
    const result = await this.repository.revoke({ ...input, reason: input.reason.trim() });
    if (result === null)
      throw new ApplicationError('FORBIDDEN', 'video delivery cannot be revoked');
    return result;
  }
}
