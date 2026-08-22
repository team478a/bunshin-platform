import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';

export interface LineAdminFunnelSnapshot {
  environment: LineConfigurationEnvironment;
  period: { from: Date; to: Date };
  cohort: { sentMessages: number; sentUsers: number; truncated: boolean };
  stages: {
    followedUsers: number;
    unfollowedUsers: number;
    openedUsers: number;
    acceptedUsers: number;
    copiedUsers: number;
    postedUsers: number;
  };
  messages: { opened: number; posted: number };
  rates: {
    openRate: number | null;
    notificationToPostRate: number | null;
    unfollowRate: number | null;
  };
}

export interface LineAdminFunnelRepository {
  summarize(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    from: Date;
    to: Date;
    cohortLimit: number;
  }): Promise<LineAdminFunnelSnapshot | null>;
}

export class GetLineAdminFunnel {
  constructor(private readonly repository: LineAdminFunnelRepository) {}

  async execute(input: {
    actorUserId: string;
    environment: LineConfigurationEnvironment;
    from: Date;
    to: Date;
  }) {
    if (
      Number.isNaN(input.from.getTime()) ||
      Number.isNaN(input.to.getTime()) ||
      input.from >= input.to
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE funnel period');
    if (input.to.getTime() - input.from.getTime() > 366 * 24 * 60 * 60 * 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'LINE funnel period must not exceed 366 days');
    const value = await this.repository.summarize({ ...input, cohortLimit: 5_000 });
    if (!value) throw new ApplicationError('NOT_FOUND', 'LINE administration not found');
    return value;
  }
}
