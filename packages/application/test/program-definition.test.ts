import { describe, expect, it } from 'vitest';
import {
  createProgramDefinition,
  parseProgramDefinition,
  programDefinitionSummary,
  validateProgramDefinition,
} from '../src';

describe('program definition v1', () => {
  it('expresses the existing 90-day program as a validated versioned definition', () => {
    const definition = createProgramDefinition({
      preset: 'SIDE_HUSTLE_90_DAY',
      durationDays: 30,
      supportModes: ['IDEA_ONLY', 'GUIDED'],
    });

    expect(validateProgramDefinition(definition)).toEqual([]);
    expect(parseProgramDefinition(definition)).toBe(definition);
    expect(definition.duration).toEqual({ type: 'FIXED_DAYS', days: 90 });
    expect(definition.phases.map((phase) => [phase.startDay, phase.endDay])).toEqual([
      [1, 14],
      [15, 30],
      [31, 60],
      [61, 90],
    ]);
    expect(definition.missions).toHaveLength(28);
    expect(programDefinitionSummary(definition)).toEqual({
      durationLabel: '90日間',
      phaseCount: 4,
      missionCount: 28,
      resultCount: 4,
    });
  });

  it('rejects references to unknown phases before publication', () => {
    const definition = createProgramDefinition({
      preset: 'SIMPLE',
      durationDays: 30,
      supportModes: ['GUIDED'],
    });
    definition.missions[0]!.phaseKey = 'MISSING';

    expect(validateProgramDefinition(definition)).toContainEqual({
      path: 'missions.0.phaseKey',
      message: '存在しない段階が指定されています。',
    });
    expect(() => parseProgramDefinition(definition)).toThrow(/invalid program definition/);
  });

  it('rejects gaps and overlaps in a fixed duration', () => {
    const definition = createProgramDefinition({
      preset: 'SIDE_HUSTLE_90_DAY',
      durationDays: 90,
      supportModes: ['IDEA_ONLY'],
    });
    definition.phases[1]!.startDay = 14;

    expect(validateProgramDefinition(definition).map((issue) => issue.message)).toContain(
      '段階の日付範囲が重複しています。',
    );

    definition.phases[1]!.startDay = 16;
    expect(validateProgramDefinition(definition).map((issue) => issue.message)).toContain(
      '段階の日付範囲に空白があります。',
    );
  });
});
