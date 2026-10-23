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

export function buildSideHustleRoadmapRevisionRequest(input: {
  readonly previous: PersonalLearningRequestContent;
  readonly roadmap: SideHustleRoadmapProposal;
  readonly fromPeriod: SideHustleRoadmapPeriod;
}): PersonalLearningRequestContent {
  const monthIndex = Number(input.fromPeriod.slice(-1)) - 1;
  const target = input.roadmap.milestones[monthIndex];
  if (!target) throw new ApplicationError('CONFLICT', 'current roadmap month is missing');

  const separator = input.previous.originalText.includes('\r\n') ? '\r\n' : '\n';
  const lines = input.previous.originalText.split(/\r?\n/);
  const mapLineIndexes = [1, 2, 3].map((month) =>
    lines.flatMap((line, index) => (line.startsWith(`${month}か月目：`) ? [index] : [])),
  );
  const stageIndexes = lines.flatMap((line, index) =>
    line.startsWith('いまの段階：') ? [index] : [],
  );
  const checkpointIndexes = lines.flatMap((line, index) =>
    line.startsWith('いまの段階の目安：') ? [index] : [],
  );
  if (
    mapLineIndexes.some((indexes) => indexes.length !== 1) ||
    stageIndexes.length !== 1 ||
    checkpointIndexes.length > 1
  )
    throw new ApplicationError('CONFLICT', 'invalid side hustle roadmap lines');

  input.roadmap.milestones.forEach((milestone, index) => {
    if (index >= monthIndex)
      lines[mapLineIndexes[index]![0]!] =
        `${index + 1}か月目：${milestone.title}（${milestone.outcome}）`;
  });
  lines[stageIndexes[0]!] = `いまの段階：${monthIndex + 1}か月目「${target.title}」`;
  const checkpointLine = `いまの段階の目安：${target.checkpoints.join('／')}`;
  if (checkpointIndexes.length === 1) lines[checkpointIndexes[0]!] = checkpointLine;
  else lines.splice(stageIndexes[0]! + 1, 0, checkpointLine);

  const originalText = lines.join(separator);
  if (!strictText(originalText, 2000)) fail();
  return Object.freeze({
    ...input.previous,
    originalText,
    currentPosition: `${monthIndex + 1}か月目の目安：${target.checkpoints.join('／')}`,
  });
}

export function assertSideHustleRoadmapRevisionPreservesCompletedMonths(input: {
  readonly base: SideHustleRoadmapProposal;
  readonly revision: SideHustleRoadmapProposal;
  readonly fromPeriod: SideHustleRoadmapPeriod;
}): void {
  const fromIndex = SIDE_HUSTLE_ROADMAP_PERIODS.indexOf(input.fromPeriod);
  for (let index = 0; index < fromIndex; index += 1) {
    if (
      JSON.stringify(input.base.milestones[index]) !==
      JSON.stringify(input.revision.milestones[index])
    )
      throw new ApplicationError('VALIDATION_ERROR', 'completed roadmap month changed');
  }
}
