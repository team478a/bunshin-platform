import { ApplicationError } from '@bunshin/shared';

import {
  SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION,
  validateSideHustleCandidate,
  type SideHustleCandidate,
} from './side-hustle-candidate';
import {
  SIDE_HUSTLE_COST_TIERS,
  type SideHustleCostTier,
  type SideHustleRequirementLevel,
} from './side-hustle-types';

export const SIDE_HUSTLE_SCREENING_RULE_VERSION = 'SIDE_HUSTLE_SCREENING_V2';

export interface SideHustleConditions {
  readonly initialBudget: SideHustleCostTier | null;
  readonly monthlyBudget: SideHustleCostTier | null;
  readonly weeklyHours: number | null;
  readonly faceExposure: 'OK' | 'NG' | null;
  readonly snsPosting: 'OK' | 'NG' | null;
  readonly clientInteraction: 'OK' | 'NG' | null;
  readonly salesOutreach: 'OK' | 'NG' | null;
  readonly inventory: 'OK' | 'NG' | null;
  readonly device: 'PC' | 'SMARTPHONE_ONLY' | null;
}

export const SIDE_HUSTLE_CONDITION_KEYS = [
  'initialBudget',
  'monthlyBudget',
  'weeklyHours',
  'faceExposure',
  'snsPosting',
  'clientInteraction',
  'salesOutreach',
  'inventory',
  'device',
] as const satisfies readonly (keyof SideHustleConditions)[];

export type SideHustleScreeningReason =
  | 'INITIAL_COST_OVER_BUDGET'
  | 'MONTHLY_COST_OVER_BUDGET'
  | 'NOT_ENOUGH_TIME'
  | 'FACE_EXPOSURE_REQUIRED'
  | 'FACE_EXPOSURE_AVOIDABLE'
  | 'SNS_POSTING_REQUIRED'
  | 'SNS_POSTING_AVOIDABLE'
  | 'CLIENT_INTERACTION_REQUIRED'
  | 'CLIENT_INTERACTION_AVOIDABLE'
  | 'SALES_OUTREACH_REQUIRED'
  | 'SALES_OUTREACH_AVOIDABLE'
  | 'INVENTORY_REQUIRED'
  | 'INVENTORY_AVOIDABLE'
  | 'PC_REQUIRED'
  | 'INITIAL_BUDGET_UNKNOWN'
  | 'MONTHLY_BUDGET_UNKNOWN'
  | 'WEEKLY_HOURS_UNKNOWN'
  | 'FACE_EXPOSURE_UNKNOWN'
  | 'SNS_POSTING_UNKNOWN'
  | 'CLIENT_INTERACTION_UNKNOWN'
  | 'SALES_OUTREACH_UNKNOWN'
  | 'INVENTORY_UNKNOWN'
  | 'DEVICE_UNKNOWN';

export interface SideHustleScreeningResult {
  readonly ruleVersion: typeof SIDE_HUSTLE_SCREENING_RULE_VERSION;
  readonly candidateContractVersion: typeof SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION;
  readonly entries: readonly {
    readonly candidateIndex: number;
    readonly name: string;
    readonly verdict: 'FIT' | 'CAUTION' | 'EXCLUDED';
    readonly reasons: readonly SideHustleScreeningReason[];
  }[];
  readonly missingConditions: readonly (keyof SideHustleConditions)[];
}

const validationError = (field: string): never => {
  throw new ApplicationError('VALIDATION_ERROR', `invalid side hustle screening input: ${field}`);
};

const validateNullableEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | null => {
  if (value === null) return null;
  if (typeof value !== 'string' || !allowed.includes(value as T)) validationError(field);
  return value as T;
};

const validateConditions = (conditions: SideHustleConditions): SideHustleConditions => {
  if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions))
    validationError('conditions');
  if (
    conditions.weeklyHours !== null &&
    (!Number.isInteger(conditions.weeklyHours) ||
      conditions.weeklyHours < 0 ||
      conditions.weeklyHours > 80)
  )
    validationError('weeklyHours');
  return Object.freeze({
    initialBudget: validateNullableEnum(
      conditions.initialBudget,
      SIDE_HUSTLE_COST_TIERS,
      'initialBudget',
    ),
    monthlyBudget: validateNullableEnum(
      conditions.monthlyBudget,
      SIDE_HUSTLE_COST_TIERS,
      'monthlyBudget',
    ),
    weeklyHours: conditions.weeklyHours,
    faceExposure: validateNullableEnum(conditions.faceExposure, ['OK', 'NG'], 'faceExposure'),
    snsPosting: validateNullableEnum(conditions.snsPosting, ['OK', 'NG'], 'snsPosting'),
    clientInteraction: validateNullableEnum(
      conditions.clientInteraction,
      ['OK', 'NG'],
      'clientInteraction',
    ),
    salesOutreach: validateNullableEnum(conditions.salesOutreach, ['OK', 'NG'], 'salesOutreach'),
    inventory: validateNullableEnum(conditions.inventory, ['OK', 'NG'], 'inventory'),
    device: validateNullableEnum(conditions.device, ['PC', 'SMARTPHONE_ONLY'], 'device'),
  });
};

const isOverBudget = (cost: SideHustleCostTier, budget: SideHustleCostTier) =>
  SIDE_HUSTLE_COST_TIERS.indexOf(cost) > SIDE_HUSTLE_COST_TIERS.indexOf(budget);

const addWorkStyleReason = (
  reasons: SideHustleScreeningReason[],
  level: SideHustleRequirementLevel,
  answer: 'OK' | 'NG' | null,
  required: SideHustleScreeningReason,
  avoidable: SideHustleScreeningReason,
  unknown: SideHustleScreeningReason,
) => {
  if (answer === null) reasons.push(unknown);
  else if (answer === 'NG' && level === 'REQUIRED') reasons.push(required);
  else if (answer === 'NG' && level === 'OPTIONAL') reasons.push(avoidable);
};

const exclusionReasons = new Set<SideHustleScreeningReason>([
  'INITIAL_COST_OVER_BUDGET',
  'MONTHLY_COST_OVER_BUDGET',
  'NOT_ENOUGH_TIME',
  'FACE_EXPOSURE_REQUIRED',
  'SNS_POSTING_REQUIRED',
  'CLIENT_INTERACTION_REQUIRED',
  'SALES_OUTREACH_REQUIRED',
  'INVENTORY_REQUIRED',
  'PC_REQUIRED',
]);

const cautionReasons = new Set<SideHustleScreeningReason>([
  'FACE_EXPOSURE_AVOIDABLE',
  'SNS_POSTING_AVOIDABLE',
  'CLIENT_INTERACTION_AVOIDABLE',
  'SALES_OUTREACH_AVOIDABLE',
  'INVENTORY_AVOIDABLE',
]);

export function screenSideHustleCandidates(
  conditions: SideHustleConditions,
  candidates: readonly SideHustleCandidate[],
): SideHustleScreeningResult {
  const input = validateConditions(conditions);
  if (!Array.isArray(candidates)) validationError('candidates');
  const validatedCandidates = candidates.map(validateSideHustleCandidate);
  const missingConditions = Object.freeze(
    SIDE_HUSTLE_CONDITION_KEYS.filter((key) => input[key] === null),
  );
  const entries = validatedCandidates.map((candidate, candidateIndex) => {
    const reasons: SideHustleScreeningReason[] = [];
    if (input.initialBudget === null) reasons.push('INITIAL_BUDGET_UNKNOWN');
    else if (isOverBudget(candidate.initialCost, input.initialBudget))
      reasons.push('INITIAL_COST_OVER_BUDGET');
    if (input.monthlyBudget === null) reasons.push('MONTHLY_BUDGET_UNKNOWN');
    else if (isOverBudget(candidate.monthlyCost, input.monthlyBudget))
      reasons.push('MONTHLY_COST_OVER_BUDGET');
    if (input.weeklyHours === null) reasons.push('WEEKLY_HOURS_UNKNOWN');
    else if (candidate.weeklyHoursMin > input.weeklyHours) reasons.push('NOT_ENOUGH_TIME');

    addWorkStyleReason(
      reasons,
      candidate.workStyle.faceExposure,
      input.faceExposure,
      'FACE_EXPOSURE_REQUIRED',
      'FACE_EXPOSURE_AVOIDABLE',
      'FACE_EXPOSURE_UNKNOWN',
    );
    addWorkStyleReason(
      reasons,
      candidate.workStyle.snsPosting,
      input.snsPosting,
      'SNS_POSTING_REQUIRED',
      'SNS_POSTING_AVOIDABLE',
      'SNS_POSTING_UNKNOWN',
    );
    addWorkStyleReason(
      reasons,
      candidate.workStyle.clientInteraction,
      input.clientInteraction,
      'CLIENT_INTERACTION_REQUIRED',
      'CLIENT_INTERACTION_AVOIDABLE',
      'CLIENT_INTERACTION_UNKNOWN',
    );
    addWorkStyleReason(
      reasons,
      candidate.workStyle.salesOutreach,
      input.salesOutreach,
      'SALES_OUTREACH_REQUIRED',
      'SALES_OUTREACH_AVOIDABLE',
      'SALES_OUTREACH_UNKNOWN',
    );
    addWorkStyleReason(
      reasons,
      candidate.workStyle.inventory,
      input.inventory,
      'INVENTORY_REQUIRED',
      'INVENTORY_AVOIDABLE',
      'INVENTORY_UNKNOWN',
    );
    if (input.device === null) reasons.push('DEVICE_UNKNOWN');
    else if (candidate.workStyle.device === 'PC_REQUIRED' && input.device === 'SMARTPHONE_ONLY')
      reasons.push('PC_REQUIRED');

    const verdict = reasons.some((reason) => exclusionReasons.has(reason))
      ? 'EXCLUDED'
      : reasons.some((reason) => cautionReasons.has(reason))
        ? 'CAUTION'
        : 'FIT';
    return Object.freeze({
      candidateIndex,
      name: candidate.name,
      verdict,
      reasons: Object.freeze(reasons),
    });
  });
  return Object.freeze({
    ruleVersion: SIDE_HUSTLE_SCREENING_RULE_VERSION,
    candidateContractVersion: SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION,
    entries: Object.freeze(entries),
    missingConditions,
  });
}
