import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it } from 'vitest';

import {
  SIDE_HUSTLE_CATALOG,
  screenSideHustleCatalog,
  type SideHustleConditions,
  type SideHustleDefinition,
} from '../src/index';

const definition = (
  key: string,
  overrides: Partial<SideHustleDefinition> = {},
): SideHustleDefinition => ({
  ...structuredClone(SIDE_HUSTLE_CATALOG[0]!),
  key,
  status: 'ACTIVE',
  checkedAt: '2026-10-22',
  ...overrides,
});

const answered = (overrides: Partial<SideHustleConditions> = {}): SideHustleConditions => ({
  initialBudget: 'OVER_50K',
  monthlyBudget: 'OVER_50K',
  weeklyHours: 80,
  faceExposure: 'OK',
  snsPosting: 'OK',
  clientInteraction: 'OK',
  salesOutreach: 'OK',
  inventory: 'OK',
  device: 'PC',
  ...overrides,
});

const expectInvalid = (conditions: SideHustleConditions) => {
  try {
    screenSideHustleCatalog(conditions, [definition('TEST')]);
    throw new Error('expected validation failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe('VALIDATION_ERROR');
  }
};

describe('side hustle screening', () => {
  it('keeps every active entry fit while reporting all nine unanswered conditions', () => {
    const conditions = Object.fromEntries(
      Object.keys(answered()).map((key) => [key, null]),
    ) as unknown as SideHustleConditions;
    const result = screenSideHustleCatalog(conditions, [definition('FIRST'), definition('SECOND')]);
    expect(result.missingConditions).toEqual([
      'initialBudget',
      'monthlyBudget',
      'weeklyHours',
      'faceExposure',
      'snsPosting',
      'clientInteraction',
      'salesOutreach',
      'inventory',
      'device',
    ]);
    expect(result.entries).toHaveLength(2);
    for (const entry of result.entries) {
      expect(entry.verdict).toBe('FIT');
      expect(entry.reasons).toHaveLength(9);
      expect(entry.reasons.every((reason) => reason.endsWith('_UNKNOWN'))).toBe(true);
    }
  });

  it('uses inclusive cost and time boundaries and excludes values above the limits', () => {
    const candidate = definition('BOUNDARY', {
      initialCost: { tier: 'UNDER_10K', basis: 'GENERAL_ESTIMATE' },
      monthlyCost: { tier: 'UNDER_10K', basis: 'GENERAL_ESTIMATE' },
      weeklyHoursMin: { hours: 5, basis: 'GENERAL_ESTIMATE' },
    });
    expect(
      screenSideHustleCatalog(
        answered({ initialBudget: 'UNDER_10K', monthlyBudget: 'UNDER_10K', weeklyHours: 5 }),
        [candidate],
      ).entries[0],
    ).toMatchObject({ verdict: 'FIT', reasons: [] });
    expect(
      screenSideHustleCatalog(
        answered({ initialBudget: 'NONE', monthlyBudget: 'NONE', weeklyHours: 4 }),
        [candidate],
      ).entries[0],
    ).toMatchObject({
      verdict: 'EXCLUDED',
      reasons: ['INITIAL_COST_OVER_BUDGET', 'MONTHLY_COST_OVER_BUDGET', 'NOT_ENOUGH_TIME'],
    });
  });

  it('distinguishes required, optional and unnecessary work styles', () => {
    const candidate = definition('WORK_STYLE', {
      workStyle: {
        faceExposure: 'REQUIRED',
        snsPosting: 'OPTIONAL',
        clientInteraction: 'NONE',
        salesOutreach: 'NONE',
        inventory: 'NONE',
        device: 'SMARTPHONE_OK',
      },
    });
    expect(
      screenSideHustleCatalog(
        answered({ faceExposure: 'NG', snsPosting: 'NG', clientInteraction: 'NG' }),
        [candidate],
      ).entries[0],
    ).toMatchObject({
      verdict: 'EXCLUDED',
      reasons: ['FACE_EXPOSURE_REQUIRED', 'SNS_POSTING_AVOIDABLE'],
    });
  });

  it('requires a PC only for PC-required definitions', () => {
    const result = screenSideHustleCatalog(answered({ device: 'SMARTPHONE_ONLY' }), [
      definition('PC', { workStyle: { ...definition('BASE').workStyle, device: 'PC_REQUIRED' } }),
      definition('PHONE', {
        workStyle: { ...definition('BASE').workStyle, device: 'SMARTPHONE_OK' },
      }),
    ]);
    expect(result.entries.map(({ verdict, reasons }) => ({ verdict, reasons }))).toEqual([
      { verdict: 'EXCLUDED', reasons: ['PC_REQUIRED'] },
      { verdict: 'FIT', reasons: [] },
    ]);
  });

  it('keeps caution reasons when another reason excludes the definition', () => {
    const candidate = definition('MIXED', {
      weeklyHoursMin: { hours: 10, basis: 'GENERAL_ESTIMATE' },
      workStyle: { ...definition('BASE').workStyle, faceExposure: 'OPTIONAL' },
    });
    expect(
      screenSideHustleCatalog(answered({ weeklyHours: 1, faceExposure: 'NG' }), [candidate])
        .entries[0],
    ).toMatchObject({
      verdict: 'EXCLUDED',
      reasons: ['NOT_ENOUGH_TIME', 'FACE_EXPOSURE_AVOIDABLE'],
    });
  });

  it('omits draft and retired definitions', () => {
    const draft = { ...definition('DRAFT'), status: 'DRAFT' as const, checkedAt: null };
    const retired = { ...definition('RETIRED'), status: 'RETIRED' as const, checkedAt: null };
    const active = definition('ACTIVE');
    expect(
      screenSideHustleCatalog(answered(), [draft, retired, active]).entries.map(({ key }) => key),
    ).toEqual(['ACTIVE']);
  });

  it('returns no entries for the default all-draft catalog', () => {
    expect(screenSideHustleCatalog(answered()).entries).toEqual([]);
  });

  it('preserves catalog order', () => {
    expect(
      screenSideHustleCatalog(answered(), [
        definition('THIRD'),
        definition('FIRST'),
        definition('SECOND'),
      ]).entries.map(({ key }) => key),
    ).toEqual(['THIRD', 'FIRST', 'SECOND']);
  });

  it('returns the same result for the same input', () => {
    const conditions = answered({ faceExposure: 'NG', weeklyHours: 2 });
    const catalog = [definition('STABLE')];
    expect(screenSideHustleCatalog(conditions, catalog)).toEqual(
      screenSideHustleCatalog(conditions, catalog),
    );
  });

  it.each([-1, 81, 1.5])('rejects invalid weeklyHours %s', (weeklyHours) => {
    expectInvalid(answered({ weeklyHours }));
  });

  it('rejects undefined enum values', () => {
    expectInvalid(answered({ faceExposure: 'MAYBE' as 'OK' }));
    expectInvalid(answered({ initialBudget: 'CHEAP' as 'NONE' }));
    expectInvalid(answered({ device: 'TABLET' as 'PC' }));
  });
});
