import type { CampaignPlanningContext, SelectedBunshinMemory } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import {
  assertPlatformFormat,
  missionString,
  normalizeMissionContent,
  validatePlatformContent,
  type MissionContent,
} from './mission-content';
import type {
  DailyMissionBrief,
  DailyMissionPlannerInput,
  DailyMissionPlannerProviderInput,
  MissionBusinessProfileContext,
  MissionPersonalizationContext,
} from './mission-generation';
import type { SocialPlatform } from './social-profile';

export interface MissionContentGeneratorInput {
  platform: SocialPlatform;
  brief: DailyMissionBrief;
  bunshin: DailyMissionPlannerInput['bunshin'];
  approvedStrategy: DailyMissionPlannerProviderInput['approvedStrategy'];
  contentPillar: { title: string; description: string | null };
  grantedKnowledge: DailyMissionPlannerInput['grantedKnowledge'];
  businessProfile?: MissionBusinessProfileContext | null;
  groupKnowledge?: Array<{
    chunkId: string;
    sourceId: string;
    type: 'GENERAL' | 'FACT' | 'FAQ' | 'RULE';
    sourceLabel: string;
    content: string;
  }>;
  selectedMemories: SelectedBunshinMemory[];
  campaign?: CampaignPlanningContext | null;
  personalization?: MissionPersonalizationContext;
  /** Existing Mission content that must be rewritten into a meaningfully different proposal. */
  variantSourceContent?: MissionContent;
  variantInstructions?: string[];
  repairInstructions?: string[];
}

export interface MissionContentGeneratorProviderInput extends Omit<
  MissionContentGeneratorInput,
  'brief' | 'selectedMemories'
> {
  brief: Pick<
    DailyMissionBrief,
    | 'missionDate'
    | 'format'
    | 'topic'
    | 'angle'
    | 'reason'
    | 'estimatedMinutes'
    | 'personalizationSourceTypes'
    | 'personalizationReason'
  >;
  selectedMemories: Array<Omit<SelectedBunshinMemory, 'id'>>;
}

export interface MissionContentGeneratorResult {
  output: MissionContent;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface MissionContentGeneratorPort {
  generate(input: MissionContentGeneratorProviderInput): Promise<MissionContentGeneratorResult>;
}

export class GenerateMissionContent {
  constructor(private readonly generator: MissionContentGeneratorPort) {}

  async execute(input: MissionContentGeneratorInput) {
    assertPlatformFormat(input.platform, input.brief.format);
    if (input.variantSourceContent !== undefined) {
      input.variantSourceContent = normalizeMissionContent(
        input.brief.format,
        input.variantSourceContent,
      );
      if (!input.variantInstructions?.length || input.variantInstructions.length > 10)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid variant instructions');
      input.variantInstructions = input.variantInstructions.map((value) =>
        missionString(value, 500, 'variant instruction'),
      );
    } else if (input.variantInstructions !== undefined) {
      throw new ApplicationError('VALIDATION_ERROR', 'variant source content is required');
    }
    if (input.repairInstructions !== undefined) {
      if (input.repairInstructions.length < 1 || input.repairInstructions.length > 10)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid repair instructions');
      input.repairInstructions = input.repairInstructions.map((value) =>
        missionString(value, 500, 'repair instruction'),
      );
    }
    const {
      missionDate,
      format,
      topic,
      angle,
      reason,
      estimatedMinutes,
      personalizationSourceTypes,
      personalizationReason,
    } = input.brief;
    const selectedMemories = input.selectedMemories.map(
      ({ type, summary, content, selectionReason }) => ({
        type,
        summary,
        content,
        selectionReason,
      }),
    );
    const result = await this.generator.generate({
      ...input,
      brief: {
        missionDate,
        format,
        topic,
        angle,
        reason,
        estimatedMinutes,
        ...(personalizationSourceTypes && personalizationReason
          ? { personalizationSourceTypes, personalizationReason }
          : {}),
      },
      selectedMemories,
    });
    const output = normalizeMissionContent(input.brief.format, result.output);
    // The model sometimes returns its own creation-time estimate even though the
    // mission brief is the user-facing time budget. Keep generated content within
    // that already validated budget instead of rejecting an otherwise usable post.
    if (
      'estimatedMinutes' in output &&
      typeof output.estimatedMinutes === 'number' &&
      output.estimatedMinutes > input.brief.estimatedMinutes
    ) {
      output.estimatedMinutes = input.brief.estimatedMinutes;
    }
    validatePlatformContent(input.platform, input.brief, output);
    return {
      ...result,
      output,
    };
  }
}
