import {
  defineNextActionDecision,
  type NextActionDecision,
  type NextActionPolicy,
} from '@bunshin/application';

export const AI_RESALE_V1_RULE_VERSION = 'AI_RESALE_V1_RULES_1';

export const RESALE_ACTION_KEYS = [
  'ITEM_FIND',
  'PHOTO',
  'LIST',
  'WAIT',
  'CHECK',
  'IMPROVE',
  'SHIPPING',
  'NEXT_ITEM',
  'RECOVERY',
] as const;
export type ResaleActionKey = (typeof RESALE_ACTION_KEYS)[number];

export const RESALE_ITEM_STATUSES = [
  'FOUND',
  'PHOTOGRAPHED',
  'LISTED',
  'SOLD',
  'SHIPPED',
  'ARCHIVED',
] as const;
export type ResaleItemStatus = (typeof RESALE_ITEM_STATUSES)[number];

export const RESALE_REACTION_STATES = ['UNKNOWN', 'NO_REACTION', 'REACTION', 'SOLD'] as const;
export type ResaleReactionState = (typeof RESALE_REACTION_STATES)[number];

export const RESALE_PROGRAM_STATES = ['ACTIVE', 'WAITING', 'PAUSED', 'COMPLETED'] as const;
export type ResaleProgramState = (typeof RESALE_PROGRAM_STATES)[number];

export const RESALE_PROGRAM_POLICIES = ['FREE_7D', 'PAID_90D'] as const;
export type ResaleProgramPolicyKey = (typeof RESALE_PROGRAM_POLICIES)[number];

export const RESALE_USER_ACTION_EVENTS = [
  'ACTION_STARTED',
  'ACTION_COMPLETED',
  'ACTION_PARTIAL',
  'ACTION_NOT_COMPLETED',
  'HELP_REQUESTED',
] as const;
export type ResaleUserActionEvent = (typeof RESALE_USER_ACTION_EVENTS)[number];

export const RESALE_DOMAIN_EVENTS = [
  'ITEM_FOUND',
  'FIRST_LISTING',
  'REACTION_OBSERVED',
  'FIRST_IMPROVEMENT',
  'FIRST_SALE',
  'ITEM_SOLD',
  'ITEM_SHIPPED',
  'SECOND_SALE',
  'NO_ITEM_AVAILABLE',
  'PAUSED',
  'RECOVERED',
  'DAY7_CLASSIFIED',
  'STANDARD_OFFER_SHOWN',
  'STANDARD_OFFER_DECLINED',
  'MONITOR_OFFER_SHOWN',
  'PAID_ENROLLED',
] as const;
export type ResaleDomainEvent = (typeof RESALE_DOMAIN_EVENTS)[number];

export const RESALE_SYSTEM_EVENTS = ['ACTION_FAILED'] as const;
export type ResaleSystemEvent = (typeof RESALE_SYSTEM_EVENTS)[number];

export const FREE_SEVEN_DAY_ACTION_PLAN = [
  { day: 1, actionKey: 'ITEM_FIND' },
  { day: 2, actionKey: 'PHOTO' },
  { day: 3, actionKey: 'LIST' },
  { day: 4, actionKey: 'ITEM_FIND' },
  { day: 5, actionKey: 'CHECK' },
  { day: 6, actionKey: 'IMPROVE' },
  { day: 7, actionKey: 'WAIT' },
] as const satisfies ReadonlyArray<{ day: number; actionKey: ResaleActionKey }>;

export type DaySevenClassification = 'NOT_STARTED' | 'PARTIAL' | 'LISTED';

export interface ResaleItemSnapshot {
  id: string;
  status: ResaleItemStatus;
  reactionState: ResaleReactionState;
  foundAt: Date;
  listedAt: Date | null;
  reactionObservedAt: Date | null;
  lastImprovedAt: Date | null;
  soldAt: Date | null;
  shippedAt: Date | null;
  reevaluateAt: Date | null;
}

export interface AiResaleV1DecisionContext {
  now: Date;
  policyKey: ResaleProgramPolicyKey;
  programDay: number;
  programState: ResaleProgramState;
  activityBaselineAt: Date;
  lastUserActionAt: Date | null;
  pauseAfterDays: number;
  defaultWaitHours: number;
  items: readonly ResaleItemSnapshot[];
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function time(value: Date | null) {
  return value?.getTime() ?? Number.POSITIVE_INFINITY;
}

function oldest(
  items: readonly ResaleItemSnapshot[],
  value: (item: ResaleItemSnapshot) => Date | null,
) {
  return [...items].sort((left, right) => time(value(left)) - time(value(right)))[0] ?? null;
}

function target(item: ResaleItemSnapshot) {
  return { resourceType: 'RESALE_ITEM', resourceId: item.id } as const;
}

function work(
  actionKey: Exclude<ResaleActionKey, 'WAIT'>,
  reasonCode: string,
  item: ResaleItemSnapshot | null,
): NextActionDecision {
  return defineNextActionDecision({
    actionKey,
    mode: 'WORK',
    reasonCode,
    target: item === null ? null : target(item),
    ruleVersion: AI_RESALE_V1_RULE_VERSION,
    reevaluateAt: null,
  });
}

function wait(
  reasonCode: string,
  item: ResaleItemSnapshot | null,
  reevaluateAt: Date,
): NextActionDecision {
  return defineNextActionDecision({
    actionKey: 'WAIT',
    mode: 'WAIT',
    reasonCode,
    target: item === null ? null : target(item),
    ruleVersion: AI_RESALE_V1_RULE_VERSION,
    reevaluateAt,
  });
}

export function shouldPauseResaleProgram(input: {
  now: Date;
  activityBaselineAt: Date;
  lastUserActionAt: Date | null;
  pauseAfterDays: number;
  activeWaitUntil: Date | null;
}) {
  if (!Number.isInteger(input.pauseAfterDays) || input.pauseAfterDays < 1) {
    throw new Error('pauseAfterDays must be a positive integer');
  }
  if (input.activeWaitUntil !== null && input.activeWaitUntil > input.now) return false;
  const baseline = input.lastUserActionAt ?? input.activityBaselineAt;
  return input.now.getTime() - baseline.getTime() >= input.pauseAfterDays * DAY_MS;
}

export function recoveryLoadForInactiveDays(inactiveDays: number) {
  if (!Number.isFinite(inactiveDays) || inactiveDays < 0) {
    throw new Error('inactiveDays must be zero or greater');
  }
  if (inactiveDays >= 14) return 'TINY' as const;
  if (inactiveDays >= 7) return 'SMALL' as const;
  return 'NORMAL' as const;
}

export function programDayAt(input: { startsAt: Date; now: Date; timeZone: string }) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: input.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateNumber = (value: Date) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    return Date.UTC(parts.year ?? 0, (parts.month ?? 1) - 1, parts.day ?? 1);
  };
  return Math.max(1, Math.floor((dateNumber(input.now) - dateNumber(input.startsAt)) / DAY_MS) + 1);
}

export function classifyDaySeven(input: {
  items: readonly ResaleItemSnapshot[];
  eventTypes: readonly string[];
}): DaySevenClassification {
  const hasListing =
    input.eventTypes.includes('FIRST_LISTING') ||
    input.items.some(
      (item) => item.listedAt !== null || ['LISTED', 'SOLD', 'SHIPPED'].includes(item.status),
    );
  if (hasListing) return 'LISTED';
  if (
    input.eventTypes.some((event) =>
      RESALE_USER_ACTION_EVENTS.includes(event as ResaleUserActionEvent),
    )
  ) {
    return 'PARTIAL';
  }
  return 'NOT_STARTED';
}

export class AiResaleV1Policy implements NextActionPolicy<AiResaleV1DecisionContext> {
  evaluate(context: AiResaleV1DecisionContext): NextActionDecision {
    if (!Number.isInteger(context.programDay) || context.programDay < 1) {
      throw new Error('programDay must be a positive integer');
    }
    if (!Number.isFinite(context.defaultWaitHours) || context.defaultWaitHours <= 0) {
      throw new Error('defaultWaitHours must be greater than zero');
    }

    const available = context.items.filter((item) => item.status !== 'ARCHIVED');
    const sold = oldest(
      available.filter((item) => item.status === 'SOLD' && item.shippedAt === null),
      (item) => item.soldAt,
    );
    if (sold !== null) return work('SHIPPING', 'SOLD_ITEM_AWAITS_SHIPPING', sold);

    const activeWaitUntil =
      oldest(
        available.filter(
          (item) =>
            item.status === 'LISTED' &&
            item.reevaluateAt !== null &&
            item.reevaluateAt > context.now,
        ),
        (item) => item.reevaluateAt,
      )?.reevaluateAt ?? null;

    const paused =
      context.programState === 'PAUSED' ||
      shouldPauseResaleProgram({
        now: context.now,
        activityBaselineAt: context.activityBaselineAt,
        lastUserActionAt: context.lastUserActionAt,
        pauseAfterDays: context.pauseAfterDays,
        activeWaitUntil,
      });
    if (paused) return work('RECOVERY', 'USER_ACTIVITY_PAUSED', null);

    const listedDue = oldest(
      available.filter(
        (item) =>
          item.status === 'LISTED' &&
          (item.reevaluateAt === null || item.reevaluateAt <= context.now),
      ),
      (item) => item.reevaluateAt ?? item.listedAt,
    );
    if (listedDue !== null) {
      if (listedDue.reactionState === 'SOLD') {
        return work('SHIPPING', 'SALE_REPORTED_AWAITS_SHIPPING', listedDue);
      }
      if (listedDue.reactionState === 'NO_REACTION') {
        return work('IMPROVE', 'LISTING_HAS_NO_REACTION', listedDue);
      }
      if (listedDue.reactionState === 'REACTION') {
        return wait(
          'LISTING_HAS_REACTION',
          listedDue,
          new Date(context.now.getTime() + context.defaultWaitHours * HOUR_MS),
        );
      }
      return work('CHECK', 'LISTING_REVIEW_IS_DUE', listedDue);
    }

    const inProgress = oldest(
      available.filter((item) => item.status === 'FOUND' || item.status === 'PHOTOGRAPHED'),
      (item) => item.foundAt,
    );
    if (inProgress?.status === 'FOUND') return work('PHOTO', 'ITEM_AWAITS_PHOTO', inProgress);
    if (inProgress?.status === 'PHOTOGRAPHED')
      return work('LIST', 'ITEM_AWAITS_LISTING', inProgress);

    const waiting = oldest(
      available.filter(
        (item) =>
          item.status === 'LISTED' && item.reevaluateAt !== null && item.reevaluateAt > context.now,
      ),
      (item) => item.reevaluateAt,
    );
    if (waiting?.reevaluateAt !== null && waiting?.reevaluateAt !== undefined) {
      return wait('LISTING_OBSERVATION_WINDOW', waiting, waiting.reevaluateAt);
    }

    const hasCompletedItem = available.some(
      (item) => item.status === 'SHIPPED' || item.status === 'SOLD',
    );
    return hasCompletedItem
      ? work('NEXT_ITEM', 'PREVIOUS_ITEM_COMPLETED', null)
      : work('ITEM_FIND', 'NO_ACTIVE_ITEM', null);
  }
}

export * from './persistence';
export * from './runtime';
export * from './participant';
export * from './line-action';
