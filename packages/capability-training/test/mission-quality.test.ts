import { describe, expect, it } from 'vitest';
import {
  AI_TRAINING_MISSION_QUALITY,
  AI_TRAINING_MISSION_QUALITY_VERSION,
  TRAINING_ACTION_KEYS,
  createAiTrainingV1Definition,
  getAiTrainingMissionQuality,
} from '../src/index';

describe('AI training mission quality catalog', () => {
  it('defines every policy action exactly once', () => {
    const keys = AI_TRAINING_MISSION_QUALITY.map((mission) => mission.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...TRAINING_ACTION_KEYS].sort());
    expect(AI_TRAINING_MISSION_QUALITY_VERSION).toBe('AI_TRAINING_MISSION_QUALITY_V1');
  });

  it('keeps work missions concrete and every transition inside the catalog', () => {
    const keys = new Set(TRAINING_ACTION_KEYS);

    for (const mission of AI_TRAINING_MISSION_QUALITY) {
      expect(mission.learningObjective.length).toBeGreaterThan(0);
      expect(mission.businessScenario.length).toBeGreaterThan(0);
      expect(mission.task.length).toBeGreaterThan(0);
      expect(mission.estimatedMinutes).toBeGreaterThan(0);
      if (mission.key !== 'WAIT') {
        expect(mission.constraints.length).toBeGreaterThan(0);
        expect(mission.successCriteria.length).toBeGreaterThan(0);
        expect(mission.evaluationCriteria.length).toBeGreaterThan(0);
        expect(mission.skillKeys.length).toBeGreaterThan(0);
      }
      if (mission.reviewMissionKey) expect(keys.has(mission.reviewMissionKey)).toBe(true);
      for (const next of mission.nextCandidates) expect(keys.has(next)).toBe(true);
    }
  });

  it('uses the same catalog for the published Program Definition', () => {
    const definition = createAiTrainingV1Definition();

    expect(definition.missions).toHaveLength(AI_TRAINING_MISSION_QUALITY.length);
    for (const mission of definition.missions) {
      const quality = getAiTrainingMissionQuality(mission.key);
      expect(quality).not.toBeNull();
      expect(mission).toMatchObject({
        title: quality?.title,
        phaseKey: quality?.phaseKey,
        estimatedMinutes: quality?.estimatedMinutes,
      });
    }
  });
});
