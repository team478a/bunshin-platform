import 'server-only';
import type { AiModelCapability } from '@bunshin/application';
import {
  SIDE_HUSTLE_CATEGORIES,
  SIDE_HUSTLE_COST_TIERS,
  SIDE_HUSTLE_DEVICES,
  SIDE_HUSTLE_REQUIREMENT_LEVELS,
  SIDE_HUSTLE_REQUIREMENT_KINDS,
  SIDE_HUSTLE_FIT_BASES,
  validateSideHustleCandidateProposal,
  type ValidatedSideHustleCandidateProposal,
} from '@bunshin/capability-training';
import { generateLearningStructured } from './openai-learning-lesson';

const stringArray = { type: 'array', items: { type: 'string' } } as const;
const candidateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    category: { type: 'string', enum: [...SIDE_HUSTLE_CATEGORIES] },
    summary: { type: 'string' },
    monetization: { type: 'string' },
    fitReasons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          basedOn: { type: 'array', items: { type: 'string', enum: [...SIDE_HUSTLE_FIT_BASES] } },
        },
        required: ['text', 'basedOn'],
      },
    },
    initialCost: { type: 'string', enum: [...SIDE_HUSTLE_COST_TIERS] },
    monthlyCost: { type: 'string', enum: [...SIDE_HUSTLE_COST_TIERS] },
    weeklyHoursMin: { type: 'integer' },
    difficulty: { type: 'integer', enum: [1, 2, 3] },
    requiredSkills: stringArray,
    workStyle: {
      type: 'object',
      additionalProperties: false,
      properties: {
        faceExposure: { type: 'string', enum: [...SIDE_HUSTLE_REQUIREMENT_LEVELS] },
        snsPosting: { type: 'string', enum: [...SIDE_HUSTLE_REQUIREMENT_LEVELS] },
        clientInteraction: { type: 'string', enum: [...SIDE_HUSTLE_REQUIREMENT_LEVELS] },
        salesOutreach: { type: 'string', enum: [...SIDE_HUSTLE_REQUIREMENT_LEVELS] },
        inventory: { type: 'string', enum: [...SIDE_HUSTLE_REQUIREMENT_LEVELS] },
        device: { type: 'string', enum: [...SIDE_HUSTLE_DEVICES] },
      },
      required: [
        'faceExposure',
        'snsPosting',
        'clientInteraction',
        'salesOutreach',
        'inventory',
        'device',
      ],
    },
    typicalFlow: stringArray,
    risks: stringArray,
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: {
            type: 'string',
            enum: [...SIDE_HUSTLE_REQUIREMENT_KINDS].filter(
              (key) => key === 'LEGAL' || key === 'PLATFORM_TERMS',
            ),
          },
          text: { type: 'string' },
        },
        required: ['kind', 'text'],
      },
    },
  },
  required: [
    'name',
    'category',
    'summary',
    'monetization',
    'fitReasons',
    'initialCost',
    'monthlyCost',
    'weeklyHoursMin',
    'difficulty',
    'requiredSkills',
    'workStyle',
    'typicalFlow',
    'risks',
    'requirements',
  ],
} as const;

export const SIDE_HUSTLE_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['READY', 'NEEDS_CONTEXT', 'NO_FIT'] },
    reason: { type: 'string' },
    questions: stringArray,
    candidates: { type: 'array', items: candidateSchema },
  },
  required: ['status', 'reason', 'questions', 'candidates'],
} as const;

export function sideHustleProposalBody(input: {
  model: string;
  safetyPolicy: string;
  instructions: string;
  hearing: unknown;
  missingConditions: readonly string[];
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
          hearing: input.hearing,
          missingConditions: input.missingConditions,
          excludedAreas: input.excludedAreas,
          outputRules: {
            maxCandidates: 3,
            costTiers: SIDE_HUSTLE_COST_TIERS,
            categories: SIDE_HUSTLE_CATEGORIES,
          },
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'side_hustle_proposal',
        strict: true,
        schema: SIDE_HUSTLE_PROPOSAL_SCHEMA,
      },
    },
  });
}

export function generateSideHustleProposal(options: {
  apiKey: string;
  model: string;
  provider: 'openai' | 'google';
  modelCapabilities: readonly AiModelCapability[];
  body: string;
  fetch?: typeof fetch;
}) {
  return generateLearningStructured({
    ...options,
    validate: (value): ValidatedSideHustleCandidateProposal =>
      validateSideHustleCandidateProposal(value),
  });
}
