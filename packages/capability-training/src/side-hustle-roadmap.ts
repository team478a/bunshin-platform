import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningRequestContent } from '@bunshin/application';
import type { SideHustleCandidate } from './side-hustle-candidate';
import {
  findSideHustleExcludedArea,
  findSideHustleGuaranteeExpression,
} from './side-hustle-safety';
import type { SideHustleHearing } from './side-hustle-hearing';

export const SIDE_HUSTLE_ROADMAP_CONTRACT_VERSION = 'SIDE_HUSTLE_ROADMAP_V1';
export const SIDE_HUSTLE_ROADMAP_PERIODS = ['MONTH_1', 'MONTH_2', 'MONTH_3'] as const;
export type SideHustleRoadmapPeriod = (typeof SIDE_HUSTLE_ROADMAP_PERIODS)[number];

export interface SideHustleRoadmapProposal {
  readonly reason: string;
  readonly milestones: readonly {
    readonly period: SideHustleRoadmapPeriod;
    readonly title: string;
    readonly outcome: string;
    readonly checkpoints: readonly string[];
    readonly weeklyHours: number;
  }[];
}

const keys = (value: unknown, expected: readonly string[]): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === expected.length &&
  Object.keys(value).every((key) => expected.includes(key));
const fail = (): never => {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid side hustle roadmap');
};
const strictText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
const safeText = (value: string) => {
  if (findSideHustleGuaranteeExpression(value) || findSideHustleExcludedArea(value)) fail();
};

export function validateSideHustleRoadmapProposal(
  value: unknown,
  context: { readonly weeklyHours: number | null },
): SideHustleRoadmapProposal {
  if (!keys(value, ['reason', 'milestones'])) fail();
  const input = value as Record<string, unknown>;
  if (
    context.weeklyHours !== null &&
    (!Number.isSafeInteger(context.weeklyHours) ||
      context.weeklyHours < 1 ||
      context.weeklyHours > 40)
  )
    fail();
  if (
    !strictText(input['reason'], 300) ||
    !Array.isArray(input['milestones']) ||
    input['milestones'].length !== 3
  )
    fail();
  const reason = input['reason'] as string;
  safeText(reason);
  const inputMilestones = input['milestones'] as unknown[];
  const milestones = inputMilestones.map((raw: unknown, index: number) => {
    if (!keys(raw, ['period', 'title', 'outcome', 'checkpoints', 'weeklyHours'])) fail();
    const item = raw as Record<string, unknown>;
    if (
      item['period'] !== SIDE_HUSTLE_ROADMAP_PERIODS[index] ||
      !strictText(item['title'], 40) ||
      !strictText(item['outcome'], 160) ||
      !Array.isArray(item['checkpoints']) ||
      item['checkpoints'].length < 1 ||
      item['checkpoints'].length > 3 ||
      !item['checkpoints'].every((text) => strictText(text, 80)) ||
      !Number.isSafeInteger(item['weeklyHours']) ||
      (item['weeklyHours'] as number) < 1 ||
      (item['weeklyHours'] as number) > 40 ||
      (context.weeklyHours !== null && (item['weeklyHours'] as number) > context.weeklyHours)
    )
      fail();
    const title = item['title'] as string;
    const outcome = item['outcome'] as string;
    safeText(title);
    safeText(outcome);
    for (const checkpoint of item['checkpoints'] as string[]) safeText(checkpoint);
    return Object.freeze({
      period: item['period'] as SideHustleRoadmapPeriod,
      title,
      outcome,
      checkpoints: Object.freeze([...(item['checkpoints'] as string[])]),
      weeklyHours: item['weeklyHours'] as number,
    });
  });
  return Object.freeze({ reason, milestones: Object.freeze(milestones) });
}

export function buildSideHustleInitialRequest(input: {
  readonly candidate: SideHustleCandidate;
  readonly hearing: SideHustleHearing;
  readonly roadmap: SideHustleRoadmapProposal;
}): PersonalLearningRequestContent {
  const [first, second, third] = input.roadmap.milestones;
  if (!first || !second || !third) return fail();
  const content: PersonalLearningRequestContent = {
    originalText: [
      `選んだ副業：${input.candidate.name}`,
      `副業の概要：${input.candidate.summary}`,
      `副業で実現したいこと：${input.hearing.freeText.goal}`,
      '90日の地図（本人が確認済み）：',
      `1か月目：${first.title}（${first.outcome}）`,
      `2か月目：${second.title}（${second.outcome}）`,
      `3か月目：${third.title}（${third.outcome}）`,
      `いまの段階：1か月目「${first.title}」`,
    ].join('\n'),
    currentPosition: `1か月目の目安：${first.checkpoints.join('／')}`,
    experienceDescription: input.hearing.freeText.experience,
    deviceType:
      input.hearing.conditions.device === 'PC'
        ? 'PC'
        : input.hearing.conditions.device === 'SMARTPHONE_ONLY'
          ? 'SMARTPHONE'
          : null,
    toolDescription: null,
  };
  return Object.freeze(content);
}
