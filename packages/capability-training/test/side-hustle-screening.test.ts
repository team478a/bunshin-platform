import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it } from 'vitest';

import {
  screenSideHustleCandidates,
  type SideHustleCandidate,
  type SideHustleConditions,
} from '../src/index';

const candidate = (
  name: string,
  overrides: Partial<SideHustleCandidate> = {},
): SideHustleCandidate => ({
  name,
  category: 'OTHER',
  summary: '概要です。',
  monetization: '作業に応じて報酬を受け取ります。',
  fitReasons: [{ text: '経験を生かせます。', basedOn: ['experience'] }],
  initialCost: 'NONE',
  monthlyCost: 'NONE',
  weeklyHoursMin: 3,
  difficulty: 1,
  requiredSkills: ['基本操作'],
  workStyle: {
    faceExposure: 'NONE',
    snsPosting: 'NONE',
    clientInteraction: 'NONE',
    salesOutreach: 'NONE',
    inventory: 'NONE',
    device: 'SMARTPHONE_OK',
  },
  typicalFlow: ['準備する', '実施する', '見直す'],
  risks: ['成果が出ない場合があります。'],
  requirements: [],
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

const expectInvalid = (conditions: SideHustleConditions, candidates = [candidate('候補')]) => {
  expect(() => screenSideHustleCandidates(conditions, candidates)).toThrowError(ApplicationError);
};

describe('side hustle candidate screening', () => {
  it('reports all nine unanswered conditions without worsening the verdict', () => {
    const conditions = Object.fromEntries(
      Object.keys(answered()).map((key) => [key, null]),
    ) as unknown as SideHustleConditions;
    const result = screenSideHustleCandidates(conditions, [candidate('一'), candidate('二')]);
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

  it('uses inclusive cost and time boundaries and excludes values above them', () => {
    const value = candidate('境界', {
      initialCost: 'UNDER_10K',
      monthlyCost: 'UNDER_10K',
      weeklyHoursMin: 5,
    });
    expect(
      screenSideHustleCandidates(
        answered({ initialBudget: 'UNDER_10K', monthlyBudget: 'UNDER_10K', weeklyHours: 5 }),
        [value],
      ).entries[0],
    ).toMatchObject({ verdict: 'FIT', reasons: [] });
    expect(
      screenSideHustleCandidates(
        answered({ initialBudget: 'NONE', monthlyBudget: 'NONE', weeklyHours: 4 }),
        [value],
      ).entries[0],
    ).toMatchObject({
      verdict: 'EXCLUDED',
      reasons: ['INITIAL_COST_OVER_BUDGET', 'MONTHLY_COST_OVER_BUDGET', 'NOT_ENOUGH_TIME'],
    });
  });

  it('distinguishes REQUIRED, OPTIONAL and NONE work styles', () => {
    const value = candidate('働き方', {
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
      screenSideHustleCandidates(
        answered({ faceExposure: 'NG', snsPosting: 'NG', clientInteraction: 'NG' }),
        [value],
      ).entries[0],
    ).toMatchObject({
      verdict: 'EXCLUDED',
      reasons: ['FACE_EXPOSURE_REQUIRED', 'SNS_POSTING_AVOIDABLE'],
    });
  });

  it('requires a PC only for PC-required candidates', () => {
    const result = screenSideHustleCandidates(answered({ device: 'SMARTPHONE_ONLY' }), [
      candidate('PC', { workStyle: { ...candidate('基準').workStyle, device: 'PC_REQUIRED' } }),
      candidate('スマホ'),
    ]);
    expect(result.entries.map(({ verdict, reasons }) => ({ verdict, reasons }))).toEqual([
      { verdict: 'EXCLUDED', reasons: ['PC_REQUIRED'] },
      { verdict: 'FIT', reasons: [] },
    ]);
  });

  it('keeps caution reasons alongside an exclusion reason', () => {
    const value = candidate('複合', {
      weeklyHoursMin: 10,
      workStyle: { ...candidate('基準').workStyle, faceExposure: 'OPTIONAL' },
    });
    expect(
      screenSideHustleCandidates(answered({ weeklyHours: 1, faceExposure: 'NG' }), [value])
        .entries[0],
    ).toMatchObject({
      verdict: 'EXCLUDED',
      reasons: ['NOT_ENOUGH_TIME', 'FACE_EXPOSURE_AVOIDABLE'],
    });
  });

  it('preserves candidate order and zero-based candidateIndex', () => {
    const result = screenSideHustleCandidates(answered(), [
      candidate('三番目'),
      candidate('一番目'),
      candidate('二番目'),
    ]);
    expect(result.entries.map(({ candidateIndex, name }) => ({ candidateIndex, name }))).toEqual([
      { candidateIndex: 0, name: '三番目' },
      { candidateIndex: 1, name: '一番目' },
      { candidateIndex: 2, name: '二番目' },
    ]);
  });

  it('returns no entries for an empty candidate array', () => {
    expect(screenSideHustleCandidates(answered(), []).entries).toEqual([]);
  });

  it('returns the same frozen result for the same input', () => {
    const conditions = answered({ faceExposure: 'NG', weeklyHours: 2 });
    const candidates = [candidate('安定')];
    const first = screenSideHustleCandidates(conditions, candidates);
    expect(first).toEqual(screenSideHustleCandidates(conditions, candidates));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.entries)).toBe(true);
    expect(Object.isFrozen(first.entries[0]?.reasons)).toBe(true);
  });

  it.each([-1, 81, 1.5])('rejects invalid weeklyHours %s', (weeklyHours) => {
    expectInvalid(answered({ weeklyHours }));
  });

  it('rejects undefined condition enum values', () => {
    expectInvalid(answered({ faceExposure: 'MAYBE' as 'OK' }));
    expectInvalid(answered({ initialBudget: 'CHEAP' as 'NONE' }));
    expectInvalid(answered({ device: 'TABLET' as 'PC' }));
  });

  it('rechecks candidate fields used by the screening rules', () => {
    expectInvalid(answered(), [{ ...candidate('不正'), weeklyHoursMin: 0 }]);
    expectInvalid(answered(), [
      {
        ...candidate('不正'),
        workStyle: { ...candidate('基準').workStyle, device: 'TABLET' as 'PC_REQUIRED' },
      },
    ]);
  });
});
