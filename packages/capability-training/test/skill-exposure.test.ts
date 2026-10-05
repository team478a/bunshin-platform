import { describe, expect, it } from 'vitest';
import { parseTrainingSupportSkillExposurePilotSettings } from '../src/skill-exposure';

describe('training support skill exposure settings', () => {
  it('is disabled by default and for malformed configuration', () => {
    expect(parseTrainingSupportSkillExposurePilotSettings(undefined)).toEqual({
      schemaVersion: 1,
      enabled: false,
      bindings: [],
    });
    expect(
      parseTrainingSupportSkillExposurePilotSettings({
        trainingSupportSkillExposurePilot: { schemaVersion: 1, enabled: true, bindings: [] },
      }).enabled,
    ).toBe(false);
  });

  it('keeps only explicit, valid, unique bindings', () => {
    expect(
      parseTrainingSupportSkillExposurePilotSettings({
        trainingSupportSkillExposurePilot: {
          schemaVersion: 1,
          enabled: true,
          bindings: [
            {
              trainingSupportSkillId: '11111111-1111-4111-8111-111111111111',
              learningObjectiveKey: 'PROMPT_BASIC_OBJECTIVE',
            },
            {
              trainingSupportSkillId: '11111111-1111-4111-8111-111111111111',
              learningObjectiveKey: 'PROMPT_BASIC_OBJECTIVE',
            },
            { trainingSupportSkillId: 'invalid', learningObjectiveKey: 'IGNORED' },
          ],
        },
      }),
    ).toEqual({
      schemaVersion: 1,
      enabled: true,
      bindings: [
        {
          trainingSupportSkillId: '11111111-1111-4111-8111-111111111111',
          learningObjectiveKey: 'PROMPT_BASIC_OBJECTIVE',
        },
      ],
    });
  });
});
