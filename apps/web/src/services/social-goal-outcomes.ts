import {
  SOCIAL_ACCOUNT_STRATEGY_GOALS,
  type SocialAccountStrategyGoal,
} from '@bunshin/capability-social';

export const SOCIAL_GOAL_OUTCOME_RESULTS = [
  'ACHIEVED',
  'SOME_PROGRESS',
  'NO_CHANGE',
  'UNKNOWN',
] as const;

export type SocialGoalOutcomeResult = (typeof SOCIAL_GOAL_OUTCOME_RESULTS)[number];

export interface SocialGoalOutcome {
  strategyGoal: SocialAccountStrategyGoal;
  result: SocialGoalOutcomeResult;
  reportedAt: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function jsonObject(value: unknown): { [key: string]: JsonValue } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) {
      result[key] = item as string | number | boolean | null;
    } else if (Array.isArray(item)) {
      result[key] = item.filter(
        (entry): entry is string | number | boolean | null =>
          entry === null || ['string', 'number', 'boolean'].includes(typeof entry),
      );
    } else if (typeof item === 'object') {
      result[key] = jsonObject(item);
    }
  }
  return result;
}

function isStrategyGoal(value: unknown): value is SocialAccountStrategyGoal {
  return (
    typeof value === 'string' &&
    (SOCIAL_ACCOUNT_STRATEGY_GOALS as readonly string[]).includes(value)
  );
}

function isGoalOutcomeResult(value: unknown): value is SocialGoalOutcomeResult {
  return (
    typeof value === 'string' && (SOCIAL_GOAL_OUTCOME_RESULTS as readonly string[]).includes(value)
  );
}

export function readSnapshotStrategyGoal(value: unknown): SocialAccountStrategyGoal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const strategy = (value as Record<string, unknown>)['strategy'];
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) return null;
  const goal = (strategy as Record<string, unknown>)['goal'];
  return isStrategyGoal(goal) ? goal : null;
}

export function readSocialGoalOutcome(value: unknown): SocialGoalOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nested = (value as Record<string, unknown>)['socialGoalOutcome'];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return null;
  const outcome = nested as Record<string, unknown>;
  return isStrategyGoal(outcome['strategyGoal']) &&
    isGoalOutcomeResult(outcome['result']) &&
    typeof outcome['reportedAt'] === 'string'
    ? {
        strategyGoal: outcome['strategyGoal'],
        result: outcome['result'],
        reportedAt: outcome['reportedAt'],
      }
    : null;
}

export function writeSocialGoalOutcome(
  current: unknown,
  outcome: SocialGoalOutcome,
): { [key: string]: JsonValue } {
  return { ...jsonObject(current), socialGoalOutcome: outcome };
}

export function summarizeSocialGoalOutcomes(values: unknown[]) {
  const summary = { achieved: 0, someProgress: 0, noChange: 0, unknown: 0 };
  for (const value of values) {
    const outcome = readSocialGoalOutcome(value);
    if (outcome?.result === 'ACHIEVED') summary.achieved += 1;
    if (outcome?.result === 'SOME_PROGRESS') summary.someProgress += 1;
    if (outcome?.result === 'NO_CHANGE') summary.noChange += 1;
    if (outcome?.result === 'UNKNOWN') summary.unknown += 1;
  }
  return summary;
}
