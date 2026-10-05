export const TRAINING_SUPPORT_SKILL_PRESENTED_EVENT = 'TRAINING_SUPPORT_SKILL_PRESENTED';
export const TRAINING_SUPPORT_SKILL_EXPOSURE_SCHEMA_VERSION = 1;

export type TrainingSupportSkillExposureBindingV1 = {
  trainingSupportSkillId: string;
  learningObjectiveKey: string;
};

export type TrainingSupportSkillExposurePilotSettingsV1 = {
  schemaVersion: 1;
  enabled: boolean;
  bindings: readonly TrainingSupportSkillExposureBindingV1[];
};

export type TrainingSupportSkillPresentationV1 = {
  schemaVersion: 1;
  trainingSupportSkillId: string;
  skillVersionId: string;
  steps: readonly string[];
  expectedOutput: string;
};

export const DEFAULT_TRAINING_SUPPORT_SKILL_EXPOSURE_PILOT_SETTINGS = {
  schemaVersion: TRAINING_SUPPORT_SKILL_EXPOSURE_SCHEMA_VERSION,
  enabled: false,
  bindings: [],
} as const satisfies TrainingSupportSkillExposurePilotSettingsV1;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const objective = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

export function parseTrainingSupportSkillExposurePilotSettings(
  value: unknown,
): TrainingSupportSkillExposurePilotSettingsV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return DEFAULT_TRAINING_SUPPORT_SKILL_EXPOSURE_PILOT_SETTINGS;
  const candidate = (value as Record<string, unknown>)['trainingSupportSkillExposurePilot'];
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
    return DEFAULT_TRAINING_SUPPORT_SKILL_EXPOSURE_PILOT_SETTINGS;
  const settings = candidate as Record<string, unknown>;
  if (settings['schemaVersion'] !== 1 || !Array.isArray(settings['bindings']))
    return DEFAULT_TRAINING_SUPPORT_SKILL_EXPOSURE_PILOT_SETTINGS;
  const bindings: TrainingSupportSkillExposureBindingV1[] = [];
  const seen = new Set<string>();
  for (const raw of settings['bindings'].slice(0, 20)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const binding = raw as Record<string, unknown>;
    const skillId = binding['trainingSupportSkillId'];
    const learningObjectiveKey = binding['learningObjectiveKey'];
    if (
      typeof skillId !== 'string' ||
      !uuid.test(skillId) ||
      typeof learningObjectiveKey !== 'string' ||
      !objective.test(learningObjectiveKey)
    )
      continue;
    const identity = `${skillId}:${learningObjectiveKey}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    bindings.push({ trainingSupportSkillId: skillId, learningObjectiveKey });
  }
  return {
    schemaVersion: 1,
    enabled: settings['enabled'] === true && bindings.length > 0,
    bindings,
  };
}
