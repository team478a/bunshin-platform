import { ApplicationError } from '@bunshin/shared';
import { PROGRAM_SUPPORT_MODES, type ProgramSupportMode } from './program-core';

export const PROGRAM_PRODUCT_KIND = 'PROGRAM_ACCESS' as const;
export const PROGRAM_PURCHASE_MODE = 'DIRECT' as const;

export interface ProgramProductTerms {
  schemaVersion: 1;
  productKind: typeof PROGRAM_PRODUCT_KIND;
  purchaseMode: typeof PROGRAM_PURCHASE_MODE;
  amountYen: number;
  currency: 'JPY';
  durationDays: number;
  supportMode: ProgramSupportMode;
  timeZone: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseProgramProductTerms(value: unknown): ProgramProductTerms | null {
  if (!object(value)) return null;
  const amountYen = value['amountYen'];
  const durationDays = value['durationDays'];
  const supportMode = value['supportMode'];
  const timeZone = value['timeZone'];
  if (
    value['schemaVersion'] !== 1 ||
    value['productKind'] !== PROGRAM_PRODUCT_KIND ||
    value['purchaseMode'] !== PROGRAM_PURCHASE_MODE ||
    !Number.isInteger(amountYen) ||
    (amountYen as number) < 1 ||
    (amountYen as number) > 10_000_000 ||
    value['currency'] !== 'JPY' ||
    !Number.isInteger(durationDays) ||
    (durationDays as number) < 1 ||
    (durationDays as number) > 3_650 ||
    !PROGRAM_SUPPORT_MODES.includes(supportMode as ProgramSupportMode) ||
    typeof timeZone !== 'string' ||
    timeZone.length < 1 ||
    timeZone.length > 80
  ) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('ja-JP', { timeZone }).format(new Date());
  } catch {
    return null;
  }
  return {
    schemaVersion: 1,
    productKind: PROGRAM_PRODUCT_KIND,
    purchaseMode: PROGRAM_PURCHASE_MODE,
    amountYen: amountYen as number,
    currency: 'JPY',
    durationDays: durationDays as number,
    supportMode: supportMode as ProgramSupportMode,
    timeZone,
  };
}

export function createProgramProductTerms(input: {
  amountYen: number;
  durationDays: number;
  supportMode: ProgramSupportMode;
  timeZone: string;
}): ProgramProductTerms {
  const terms: ProgramProductTerms = {
    schemaVersion: 1,
    productKind: PROGRAM_PRODUCT_KIND,
    purchaseMode: PROGRAM_PURCHASE_MODE,
    amountYen: input.amountYen,
    currency: 'JPY',
    durationDays: input.durationDays,
    supportMode: input.supportMode,
    timeZone: input.timeZone,
  };
  const parsed = parseProgramProductTerms(terms);
  if (!parsed) throw new ApplicationError('VALIDATION_ERROR', 'invalid program product terms');
  return parsed;
}
