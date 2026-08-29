import { ApplicationError } from '@bunshin/shared';

export const COMMON_BADGE_EVENT_TYPES = [
  'BUNSHIN_CREATED',
  'STRATEGY_APPROVED',
  'MISSION_VIEWED',
  'MISSION_ACCEPTED',
  'POSTED',
  'FEEDBACK_RECORDED',
  'IMAGE_COMPLETED',
] as const;
export type CommonBadgeEventType = (typeof COMMON_BADGE_EVENT_TYPES)[number];

export interface CommonBadgeCandidate {
  workspaceId: string;
  userId: string;
  sourceBunshinId: string | null;
  eventType: CommonBadgeEventType;
  sourceEventId: string;
  occurredAt: Date;
}

export type CommonBadgeProcessResult =
  'AWARDED' | 'PROGRESSED' | 'ALREADY_PROCESSED' | 'NO_ACTIVE_BADGE' | 'NOT_ELIGIBLE';

export interface CommonBadgeCatalogItem {
  code: string;
  category: 'START' | 'CONTINUITY' | 'CHALLENGE';
  title: string;
  description: string;
  conditionType: 'FIRST' | 'STREAK_DAILY' | 'STREAK_WEEKLY';
  eventType: CommonBadgeEventType;
  target: number;
}

export const COMMON_BADGE_CATALOG: readonly CommonBadgeCatalogItem[] = [
  {
    code: 'FIRST_PERSONA',
    category: 'START',
    title: 'はじめの一歩',
    description: 'はじめて分身を作りました',
    conditionType: 'FIRST',
    eventType: 'BUNSHIN_CREATED',
    target: 1,
  },
  {
    code: 'STRATEGY_READY',
    category: 'START',
    title: '発信準備完了',
    description: 'SNSの発信戦略を承認しました',
    conditionType: 'FIRST',
    eventType: 'STRATEGY_APPROVED',
    target: 1,
  },
  {
    code: 'FIRST_PLAN_VIEW',
    category: 'START',
    title: '初めての企画',
    description: 'はじめて今日の企画を確認しました',
    conditionType: 'FIRST',
    eventType: 'MISSION_VIEWED',
    target: 1,
  },
  {
    code: 'FIRST_ADOPTION',
    category: 'START',
    title: '初めての採用',
    description: 'はじめて投稿案を採用しました',
    conditionType: 'FIRST',
    eventType: 'MISSION_ACCEPTED',
    target: 1,
  },
  {
    code: 'FIRST_POST',
    category: 'START',
    title: '初投稿',
    description: 'はじめて投稿完了を記録しました',
    conditionType: 'FIRST',
    eventType: 'POSTED',
    target: 1,
  },
  {
    code: 'FIRST_FEEDBACK',
    category: 'START',
    title: '振り返り上手',
    description: 'はじめて投稿を振り返りました',
    conditionType: 'FIRST',
    eventType: 'FEEDBACK_RECORDED',
    target: 1,
  },
  {
    code: 'VIEW_STREAK_3',
    category: 'CONTINUITY',
    title: '3日続けて確認',
    description: '3日連続で今日の企画を確認しました',
    conditionType: 'STREAK_DAILY',
    eventType: 'MISSION_VIEWED',
    target: 3,
  },
  {
    code: 'VIEW_STREAK_7',
    category: 'CONTINUITY',
    title: '1週間続けて確認',
    description: '7日連続で今日の企画を確認しました',
    conditionType: 'STREAK_DAILY',
    eventType: 'MISSION_VIEWED',
    target: 7,
  },
  {
    code: 'WEEKLY_POST_4',
    category: 'CONTINUITY',
    title: '4週間継続',
    description: '4週連続で投稿完了を記録しました',
    conditionType: 'STREAK_WEEKLY',
    eventType: 'POSTED',
    target: 4,
  },
  {
    code: 'IMAGE_FIRST',
    category: 'CHALLENGE',
    title: '画像づくりに挑戦',
    description: 'はじめて画像生成を完了しました',
    conditionType: 'FIRST',
    eventType: 'IMAGE_COMPLETED',
    target: 1,
  },
] as const;

const badgeDayKey = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return `${read('year')}-${String(read('month')).padStart(2, '0')}-${String(read('day')).padStart(2, '0')}`;
};

export const calculateBadgeStreak = (
  dates: readonly Date[],
  cadence: 'DAILY' | 'WEEKLY',
  timezone: string,
) => {
  const keys = dates.map((value) => {
    if (cadence === 'DAILY') return badgeDayKey(value, timezone);
    const monday = new Date(`${badgeDayKey(value, timezone)}T00:00:00.000Z`);
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() || 7) + 1);
    return badgeDayKey(monday, 'UTC');
  });
  let longest = 0,
    current = 0,
    previous: number | null = null;
  const step = (cadence === 'DAILY' ? 1 : 7) * 86_400_000;
  for (const key of [...new Set(keys)].sort()) {
    const value = new Date(`${key}T00:00:00.000Z`).getTime();
    current = previous !== null && value - previous === step ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = value;
  }
  return longest;
};

export interface CommonBadgeProcessorRepository {
  ensureCatalog(input: {
    actorUserId: string;
    catalog: readonly CommonBadgeCatalogItem[];
    publishedAt: Date;
  }): Promise<{ created: number; existing: number }>;
  listCandidates(input: { limit: number }): Promise<CommonBadgeCandidate[]>;
  process(input: CommonBadgeCandidate & { timezone: string }): Promise<CommonBadgeProcessResult>;
  recalculate(input: {
    workspaceId: string;
    userId: string;
    timezone: string;
  }): Promise<{ scanned: number; awarded: number; progressed: number }>;
  migrateLegacy(input: { limit: number }): Promise<{ migrated: number; skipped: number }>;
}

const validateTimezone = (timezone: string) => {
  try {
    new Intl.DateTimeFormat('ja-JP', { timeZone: timezone }).format(new Date());
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid badge processor timezone');
  }
};

export class EnsureCommonBadgeCatalog {
  constructor(private readonly repository: CommonBadgeProcessorRepository) {}
  execute(input: { actorUserId: string; publishedAt?: Date }) {
    if (!input.actorUserId.trim())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge catalog actor');
    return this.repository.ensureCatalog({
      actorUserId: input.actorUserId.trim(),
      catalog: COMMON_BADGE_CATALOG,
      publishedAt: input.publishedAt ?? new Date(),
    });
  }
}

export class ProcessCommonBadgeBatch {
  constructor(private readonly repository: CommonBadgeProcessorRepository) {}
  async execute(input: { limit?: number; timezone?: string } = {}) {
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge processor limit');
    const timezone = input.timezone?.trim() || 'Asia/Tokyo';
    validateTimezone(timezone);
    const candidates = await this.repository.listCandidates({ limit });
    const results: Record<CommonBadgeProcessResult, number> = {
      AWARDED: 0,
      PROGRESSED: 0,
      ALREADY_PROCESSED: 0,
      NO_ACTIVE_BADGE: 0,
      NOT_ELIGIBLE: 0,
    };
    for (const candidate of candidates)
      results[await this.repository.process({ ...candidate, timezone })] += 1;
    return { scanned: candidates.length, ...results };
  }
}

export class MigrateLegacyBadges {
  constructor(private readonly repository: CommonBadgeProcessorRepository) {}
  execute(input: { limit?: number } = {}) {
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge migration limit');
    return this.repository.migrateLegacy({ limit });
  }
}

export class RecalculateCommonBadgesForUser {
  constructor(private readonly repository: CommonBadgeProcessorRepository) {}
  execute(input: { workspaceId: string; userId: string; timezone?: string }) {
    if (!input.workspaceId.trim() || !input.userId.trim())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge recalculation scope');
    const timezone = input.timezone?.trim() || 'Asia/Tokyo';
    validateTimezone(timezone);
    return this.repository.recalculate({
      workspaceId: input.workspaceId,
      userId: input.userId,
      timezone,
    });
  }
}
