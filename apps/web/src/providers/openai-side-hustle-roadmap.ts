import 'server-only';
import type { AiModelCapability } from '@bunshin/application';
import {
  SIDE_HUSTLE_ROADMAP_PERIODS,
  validateSideHustleRoadmapProposal,
  type SideHustleRoadmapProposal,
} from '@bunshin/capability-training';
import { generateLearningStructured } from './openai-learning-lesson';

export const SIDE_HUSTLE_ROADMAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reason: { type: 'string', minLength: 1, maxLength: 300 },
    milestones: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          period: { type: 'string', enum: [...SIDE_HUSTLE_ROADMAP_PERIODS] },
          title: { type: 'string', minLength: 1, maxLength: 40 },
          outcome: { type: 'string', minLength: 1, maxLength: 160 },
          checkpoints: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
          weeklyHours: { type: 'integer', minimum: 1, maximum: 40 },
        },
        required: ['period', 'title', 'outcome', 'checkpoints', 'weeklyHours'],
      },
    },
  },
  required: ['reason', 'milestones'],
} as const;

export function sideHustleRoadmapBody(input: {
  model: string;
  safetyPolicy: string;
  instructions: string;
  selectedSideHustle: unknown;
  hearing: unknown;
  excludedAreas: readonly { label: string; reason: string }[];
}) {
  return JSON.stringify({
    model: input.model,
    store: false,
    input: [
      { role: 'system', content: input.safetyPolicy },
      { role: 'system', content: input.instructions },
      {
        role: 'user',
        content: JSON.stringify({
          selectedSideHustle: input.selectedSideHustle,
          hearing: input.hearing,
          excludedAreas: input.excludedAreas,
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'side_hustle_roadmap',
        strict: true,
        schema: SIDE_HUSTLE_ROADMAP_SCHEMA,
      },
    },
  });
}

export function generateSideHustleRoadmap(options: {
  apiKey: string;
  model: string;
  provider: 'openai' | 'google';
  modelCapabilities: readonly AiModelCapability[];
  body: string;
  weeklyHours: number | null;
  fetch?: typeof fetch;
}) {
  return generateLearningStructured({
    ...options,
    validate: (value): SideHustleRoadmapProposal =>
      validateSideHustleRoadmapProposal(value, { weeklyHours: options.weeklyHours }),
  });
}
