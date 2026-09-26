import { ApplicationError } from '@bunshin/shared';
import { BUSINESS_GROWTH_ACTION_KINDS, type BusinessGrowthAction } from './business-growth-actions';
import { BUSINESS_GROWTH_PROGRAM_PHASES } from './business-growth-program';

export const LINE_MISSION_PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'X',
  'THREADS',
  'YOUTUBE_SHORTS',
  'OTHER',
] as const;
export type LineMissionPlatform = (typeof LINE_MISSION_PLATFORMS)[number];
export const LINE_MISSION_FORMATS = [
  'TEXT',
  'SLIDE',
  'LIVE_ACTION',
  'AI_VIDEO_PROMPT',
  'IMAGE',
] as const;
export type LineMissionFormat = (typeof LINE_MISSION_FORMATS)[number];

export interface LineMissionNotificationSummary {
  platform: LineMissionPlatform;
  format: LineMissionFormat;
  estimatedMinutes: number;
  topic: string;
  researched: boolean;
  campaign?: { name: string; classification: 'PRODUCT_RELATED' | 'ADVERTISEMENT' } | null;
  externalLinkIncluded?: boolean;
  businessAction?: BusinessGrowthAction;
}

export interface LineMissionNotificationSummaryRepository {
  resolve(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
  }): Promise<LineMissionNotificationSummary | null>;
}

export function normalizeLineMissionNotificationSummary(
  input: LineMissionNotificationSummary,
): LineMissionNotificationSummary {
  if (!LINE_MISSION_PLATFORMS.includes(input.platform))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission platform');
  if (!LINE_MISSION_FORMATS.includes(input.format))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission format');
  if (
    !Number.isInteger(input.estimatedMinutes) ||
    input.estimatedMinutes < 1 ||
    input.estimatedMinutes > 120
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission estimated minutes');
  const topic = [...input.topic]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!topic) throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission topic');
  if (typeof input.researched !== 'boolean')
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission research marker');
  if (input.externalLinkIncluded !== undefined && typeof input.externalLinkIncluded !== 'boolean')
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission external link marker');
  if (
    input.businessAction &&
    (!BUSINESS_GROWTH_ACTION_KINDS.includes(input.businessAction.kind) ||
      !input.businessAction.label.trim() ||
      !input.businessAction.title.trim() ||
      !input.businessAction.reason.trim() ||
      input.businessAction.steps.length !== 3)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission business action');
  if (
    input.businessAction?.program &&
    (!Number.isInteger(input.businessAction.program.cycleNumber) ||
      input.businessAction.program.cycleNumber < 1 ||
      !Number.isInteger(input.businessAction.program.day) ||
      input.businessAction.program.day < 1 ||
      input.businessAction.program.day > 90 ||
      !BUSINESS_GROWTH_PROGRAM_PHASES.some(
        (phase) => phase.key === input.businessAction?.program?.phaseKey,
      ) ||
      !input.businessAction.program.phaseLabel.trim())
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission business program');
  const campaign = input.campaign
    ? {
        name: input.campaign.name.replace(/\s+/g, ' ').trim().slice(0, 60),
        classification: input.campaign.classification,
      }
    : null;
  if (
    campaign &&
    (!campaign.name || !['PRODUCT_RELATED', 'ADVERTISEMENT'].includes(campaign.classification))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid LINE Mission campaign');
  return {
    ...input,
    topic: topic.slice(0, 60),
    ...(input.campaign === undefined ? {} : { campaign }),
    ...(input.businessAction
      ? {
          businessAction: {
            ...input.businessAction,
            label: input.businessAction.label.trim().slice(0, 30),
            title: input.businessAction.title.trim().slice(0, 100),
            reason: input.businessAction.reason.trim().slice(0, 200),
            steps: input.businessAction.steps.map((step) => step.trim().slice(0, 120)),
          },
        }
      : {}),
  };
}
