import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import { DailyMissionMutation } from './daily-mission-authorization';
import type { DailyMissionRepository, DailyMissionScope } from './daily-mission-runtime';
import type { MissionActivity } from './mission-engagement';
import { missionIdempotencyKey } from './mission-engagement-validation';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './social-profile';
export const POST_SOURCES = ['MANUAL'] as const;
export type PostSource = (typeof POST_SOURCES)[number];
export const MISSION_FEEDBACK_RATINGS = ['GOOD', 'NEUTRAL', 'BAD'] as const;
export type MissionFeedbackRating = (typeof MISSION_FEEDBACK_RATINGS)[number];

export interface PostRecord {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  platform: SocialPlatform;
  postedAt: Date;
  postUrl: string | null;
  externalPostId: string | null;
  source: PostSource;
  manualMetrics: Record<string, unknown> | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionFeedback {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  actorUserId: string;
  rating: MissionFeedbackRating;
  createdAt: Date;
  updatedAt: Date;
}
export interface MissionOutcomeRepository {
  getPost(input: DailyMissionScope & { dailyMissionId: string }): Promise<PostRecord | null>;
  recordPost(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt: Date;
      postUrl: string | null;
      idempotencyKey: string;
    },
  ): Promise<{ post: PostRecord; activity: MissionActivity } | null>;
  getFeedback(
    input: DailyMissionScope & { dailyMissionId: string },
  ): Promise<MissionFeedback | null>;
  recordFeedback(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ): Promise<{ feedback: MissionFeedback; activity: MissionActivity } | null>;
}

function postUrl(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') return null;
  const normalized = value.trim();
  if (normalized.length > 2048) throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid post url');
  }
  return normalized;
}
export class GetPostRecord {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getPost(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}
export class RecordManualPost extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      platform: SocialPlatform;
      postedAt?: Date;
      postUrl?: string | null;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!SOCIAL_PLATFORMS.includes(input.platform))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid platform');
    const postedAt = input.postedAt ?? new Date();
    if (Number.isNaN(postedAt.valueOf()) || postedAt.valueOf() > Date.now() + 5 * 60_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid posted at');
    const value = await this.outcomes.recordPost({
      ...input,
      postedAt,
      postUrl: postUrl(input.postUrl),
      idempotencyKey: missionIdempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}
export class GetMissionFeedback {
  constructor(private readonly outcomes: MissionOutcomeRepository) {}
  async execute(input: DailyMissionScope & { dailyMissionId: string }) {
    const value = await this.outcomes.getFeedback(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'mission feedback not found');
    return value;
  }
}
export class RecordMissionFeedback extends DailyMissionMutation {
  constructor(
    missions: DailyMissionRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly outcomes: MissionOutcomeRepository,
  ) {
    super(missions, assignments);
  }
  async execute(
    input: DailyMissionScope & {
      dailyMissionId: string;
      rating: MissionFeedbackRating;
      idempotencyKey: string;
    },
  ) {
    await this.requireActive(input);
    if (!MISSION_FEEDBACK_RATINGS.includes(input.rating))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid feedback rating');
    const value = await this.outcomes.recordFeedback({
      ...input,
      idempotencyKey: missionIdempotencyKey(input.idempotencyKey),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'post record not found');
    return value;
  }
}
