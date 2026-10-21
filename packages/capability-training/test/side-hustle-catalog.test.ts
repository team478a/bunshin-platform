import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it } from 'vitest';

import {
  SIDE_HUSTLE_CATALOG,
  SIDE_HUSTLE_CATEGORIES,
  SIDE_HUSTLE_EXCLUDED_AREAS,
  validateSideHustleCatalog,
  type SideHustleDefinition,
} from '../src/index';

const draft = (): SideHustleDefinition => structuredClone(SIDE_HUSTLE_CATALOG[0]!);
const active = () => ({ ...draft(), status: 'ACTIVE' as const, checkedAt: '2026-10-22' });
const expectInvalid = (definitions: unknown) => {
  try {
    validateSideHustleCatalog(definitions);
    throw new Error('expected validation failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe('VALIDATION_ERROR');
  }
};

describe('side hustle catalog', () => {
  it('validates the 12 draft definitions with general-estimate cost and time bases', () => {
    expect(SIDE_HUSTLE_CATALOG).toHaveLength(12);
    for (const definition of SIDE_HUSTLE_CATALOG) {
      expect(definition.status).toBe('DRAFT');
      expect(definition.checkedAt).toBeNull();
      expect(definition.initialCost.basis).toBe('GENERAL_ESTIMATE');
      expect(definition.monthlyCost.basis).toBe('GENERAL_ESTIMATE');
      expect(definition.weeklyHoursMin.basis).toBe('GENERAL_ESTIMATE');
    }
  });

  it('contains two definitions for each category', () => {
    for (const category of SIDE_HUSTLE_CATEGORIES) {
      expect(
        SIDE_HUSTLE_CATALOG.filter((definition) => definition.category === category),
      ).toHaveLength(2);
    }
  });

  it.each([
    ['duplicate key', () => [draft(), draft()]],
    ['invalid key', () => [{ ...draft(), key: 'invalid-key' }]],
    ['overlong text', () => [{ ...draft(), name: 'あ'.repeat(41) }]],
    ['too many entries', () => [{ ...draft(), requiredSkills: Array(6).fill('技能') }]],
    ['unknown enum', () => [{ ...draft(), category: 'UNKNOWN' }]],
    ['active without checkedAt', () => [{ ...draft(), status: 'ACTIVE', checkedAt: null }]],
    ['impossible checkedAt', () => [{ ...active(), checkedAt: '2026-02-30' }]],
    ['surrounding whitespace', () => [{ ...draft(), summary: ` ${draft().summary}` }]],
    ['empty text', () => [{ ...draft(), summary: '' }]],
  ])('rejects %s', (_label, definitions) => {
    expectInvalid(definitions());
  });

  it.each(['必ず稼げ', '確実に稼げ', '誰でも稼げ', '絶対', '保証', '月収', '万円稼'])(
    'rejects the guarantee expression %s in protected text fields',
    (expression) => {
      expectInvalid([{ ...draft(), monetization: expression }]);
      expectInvalid([{ ...draft(), summary: expression }]);
      expectInvalid([{ ...draft(), typicalFlow: [expression, '二番目', '三番目'] }]);
      expectInvalid([{ ...draft(), risks: [expression] }]);
    },
  );

  it('returns a frozen catalog that cannot be changed', () => {
    const result = validateSideHustleCatalog([draft()]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0]?.workStyle)).toBe(true);
    expect(() => result.push(draft())).toThrow();
  });

  it('contains eight excluded areas with unique keys', () => {
    expect(SIDE_HUSTLE_EXCLUDED_AREAS).toHaveLength(8);
    expect(new Set(SIDE_HUSTLE_EXCLUDED_AREAS.map(({ key }) => key)).size).toBe(8);
  });
});
