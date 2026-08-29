import { ApplicationError } from '@bunshin/shared';
import type { BadgeVisibilityPolicy } from './badge-core';

export type BadgeUserState = 'LOCKED' | 'IN_PROGRESS' | 'AWARDED';

export interface BadgeUserItem {
  badgeVersionId: string;
  awardId: string | null;
  code: string;
  category: string;
  title: string;
  description: string;
  imageKey: string;
  lockedImageKey: string | null;
  altText: string;
  backgroundColor: string | null;
  state: BadgeUserState;
  currentValue: number;
  targetValue: number;
  progressPercent: number;
  awardedAt: Date | null;
  sourceType: string | null;
  visibility: BadgeVisibilityPolicy;
  sharedGroupId: string | null;
}

export interface BadgeUserDashboard {
  acquired: BadgeUserItem[];
  inProgress: BadgeUserItem[];
  recommended: BadgeUserItem[];
  shareableGroups: Array<{ id: string; name: string }>;
}

export interface BadgeUserExperienceRepository {
  getDashboard(input: {
    workspaceId: string;
    actorUserId: string;
    now: Date;
  }): Promise<BadgeUserDashboard | null>;
  setVisibility(input: {
    workspaceId: string;
    actorUserId: string;
    badgeAwardId: string;
    visibility: BadgeVisibilityPolicy;
    sharedGroupId: string | null;
  }): Promise<{ visibility: BadgeVisibilityPolicy; sharedGroupId: string | null } | null>;
}

const required = (value: string, field: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class GetBadgeUserDashboard {
  constructor(private readonly repository: BadgeUserExperienceRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; now?: Date }) {
    const result = await this.repository.getDashboard({
      workspaceId: required(input.workspaceId, 'workspace id'),
      actorUserId: required(input.actorUserId, 'actor user id'),
      now: input.now ?? new Date(),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge dashboard is not available');
    return result;
  }
}

export class SetBadgeAwardVisibility {
  constructor(private readonly repository: BadgeUserExperienceRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    badgeAwardId: string;
    visibility: BadgeVisibilityPolicy;
    sharedGroupId: string | null;
  }) {
    if (
      (input.visibility === 'PRIVATE' && input.sharedGroupId !== null) ||
      (input.visibility === 'GROUP' && !input.sharedGroupId)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge sharing scope');
    const result = await this.repository.setVisibility({
      ...input,
      workspaceId: required(input.workspaceId, 'workspace id'),
      actorUserId: required(input.actorUserId, 'actor user id'),
      badgeAwardId: required(input.badgeAwardId, 'badge award id'),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge sharing is not allowed');
    return result;
  }
}
