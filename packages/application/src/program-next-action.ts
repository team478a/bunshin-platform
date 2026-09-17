import { ApplicationError } from '@bunshin/shared';

export const NEXT_ACTION_MODES = ['WORK', 'WAIT'] as const;
export type NextActionMode = (typeof NEXT_ACTION_MODES)[number];

export interface NextActionTarget {
  resourceType: string;
  resourceId: string;
}

export interface NextActionDecision {
  actionKey: string;
  mode: NextActionMode;
  reasonCode: string;
  target: NextActionTarget | null;
  ruleVersion: string;
  reevaluateAt: Date | null;
}

export interface NextActionPolicy<TContext> {
  evaluate(context: TContext): NextActionDecision;
}

const keyPattern = /^[A-Z][A-Z0-9_]{0,79}$/;

function requiredKey(value: string, field: string) {
  const normalized = value.trim();
  if (!keyPattern.test(normalized)) {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
  return normalized;
}

function requiredText(value: string, field: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
  return normalized;
}

function validDate(value: Date, field: string) {
  if (Number.isNaN(value.getTime())) {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
}

export function defineNextActionDecision(input: NextActionDecision): NextActionDecision {
  if (input.mode === 'WAIT' && input.reevaluateAt === null) {
    throw new ApplicationError('VALIDATION_ERROR', 'WAIT requires reevaluateAt');
  }
  if (input.reevaluateAt !== null) validDate(input.reevaluateAt, 'reevaluateAt');
  if (input.target !== null) {
    requiredKey(input.target.resourceType, 'target.resourceType');
    requiredText(input.target.resourceId, 'target.resourceId', 200);
  }
  return {
    actionKey: requiredKey(input.actionKey, 'actionKey'),
    mode: input.mode,
    reasonCode: requiredKey(input.reasonCode, 'reasonCode'),
    target: input.target,
    ruleVersion: requiredText(input.ruleVersion, 'ruleVersion', 80),
    reevaluateAt: input.reevaluateAt,
  };
}
