import { ApplicationError } from '@bunshin/shared';
import { SIDE_HUSTLE_CONDITION_KEYS, type SideHustleConditions } from './side-hustle-screening';
import { SIDE_HUSTLE_COST_TIERS } from './side-hustle-types';

export const SIDE_HUSTLE_HEARING_VERSION = 'SIDE_HUSTLE_HEARING_V1';

export interface SideHustleHearing {
  readonly conditions: SideHustleConditions;
  readonly freeText: {
    readonly goal: string | null;
    readonly experience: string | null;
    readonly interest: string | null;
    readonly constraint: string | null;
  };
  readonly followUps: readonly { readonly question: string; readonly answer: string }[];
}

const invalid = (field: string): never => {
  throw new ApplicationError('VALIDATION_ERROR', `invalid side hustle hearing: ${field}`);
};
const object = (value: unknown, field: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[], field: string) => {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    invalid(field);
};
const nullableText = (value: unknown, field: string, maximum: number): string | null => {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value
  )
    invalid(field);
  return value as string;
};

export function validateSideHustleHearing(value: unknown): SideHustleHearing {
  const input = object(value, 'hearing');
  exact(input, ['conditions', 'freeText', 'followUps'], 'hearing');
  const conditions = object(input.conditions, 'conditions');
  exact(conditions, SIDE_HUSTLE_CONDITION_KEYS, 'conditions');
  if (
    conditions.weeklyHours !== null &&
    (!Number.isInteger(conditions.weeklyHours) ||
      Number(conditions.weeklyHours) < 1 ||
      Number(conditions.weeklyHours) > 20)
  )
    invalid('conditions.weeklyHours');
  const conditionResult: SideHustleConditions = Object.freeze({
    initialBudget: validateEnum(conditions.initialBudget, SIDE_HUSTLE_COST_TIERS, 'initialBudget'),
    monthlyBudget: validateEnum(conditions.monthlyBudget, SIDE_HUSTLE_COST_TIERS, 'monthlyBudget'),
    weeklyHours: conditions.weeklyHours as number | null,
    faceExposure: validateEnum(conditions.faceExposure, ['OK', 'NG'] as const, 'faceExposure'),
    snsPosting: validateEnum(conditions.snsPosting, ['OK', 'NG'] as const, 'snsPosting'),
    clientInteraction: validateEnum(
      conditions.clientInteraction,
      ['OK', 'NG'] as const,
      'clientInteraction',
    ),
    salesOutreach: validateEnum(conditions.salesOutreach, ['OK', 'NG'] as const, 'salesOutreach'),
    inventory: validateEnum(conditions.inventory, ['OK', 'NG'] as const, 'inventory'),
    device: validateEnum(conditions.device, ['PC', 'SMARTPHONE_ONLY'] as const, 'device'),
  });
  const freeText = object(input.freeText, 'freeText');
  exact(freeText, ['goal', 'experience', 'interest', 'constraint'], 'freeText');
  if (!Array.isArray(input.followUps) || input.followUps.length > 8) invalid('followUps');
  const followUps = (input.followUps as unknown[]).map((entry, index) => {
    const followUp = object(entry, `followUps[${index}]`);
    exact(followUp, ['question', 'answer'], `followUps[${index}]`);
    const question = nullableText(followUp.question, `followUps[${index}].question`, 200);
    const answer = nullableText(followUp.answer, `followUps[${index}].answer`, 300);
    if (!question || !answer) invalid(`followUps[${index}]`);
    return Object.freeze({ question: question as string, answer: answer as string });
  });
  return Object.freeze({
    conditions: conditionResult,
    freeText: Object.freeze({
      goal: nullableText(freeText.goal, 'freeText.goal', 300),
      experience: nullableText(freeText.experience, 'freeText.experience', 300),
      interest: nullableText(freeText.interest, 'freeText.interest', 300),
      constraint: nullableText(freeText.constraint, 'freeText.constraint', 300),
    }),
    followUps: Object.freeze(followUps),
  });
}

function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !allowed.includes(value as T)) invalid(field);
  return value as T;
}

export function sideHustleHearingReadyForProposal(hearing: SideHustleHearing): boolean {
  return hearing.freeText.goal !== null;
}
