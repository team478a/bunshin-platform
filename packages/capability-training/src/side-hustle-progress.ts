import { ApplicationError } from '@bunshin/shared';
import {
  findSideHustleExcludedArea,
  findSideHustleGuaranteeExpression,
} from './side-hustle-safety';
import type { SideHustleRoadmapProposal } from './side-hustle-roadmap';

export const SIDE_HUSTLE_CHECKIN_VERSION = 'SIDE_HUSTLE_CHECKIN_V1' as const;
export const SIDE_HUSTLE_STAGE_ADVANCE_PRACTICE_THRESHOLD = 2;
export const SIDE_HUSTLE_STAGE_ADVANCE_MIN_DAYS = 28;
export const SIDE_HUSTLE_PERIODS = ['MONTH_1', 'MONTH_2', 'MONTH_3'] as const;
export type SideHustlePeriod = (typeof SIDE_HUSTLE_PERIODS)[number];
export type SideHustleCheckpointResult = 'DONE' | 'PARTLY' | 'NOT_YET';
export type SideHustleCheckinDecision = 'ADVANCE' | 'CONTINUE' | 'REVISE' | 'RESELECT';

export interface SideHustleCheckin {
  topicId: string;
  period: SideHustlePeriod;
  checkpointResults: SideHustleCheckpointResult[];
  feeling: 'EASY' | 'OK' | 'HARD';
  note: string | null;
  decision: SideHustleCheckinDecision;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = (): never => {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid side hustle checkin');
};

export function validateSideHustleCheckin(
  value: unknown,
  checkpointCount: number,
): SideHustleCheckin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  const keys = ['topicId', 'period', 'checkpointResults', 'feeling', 'note', 'decision'];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some((key) => !keys.includes(key)))
    return invalid();
  if (
    typeof v.topicId !== 'string' ||
    !uuid.test(v.topicId) ||
    !SIDE_HUSTLE_PERIODS.includes(v.period as SideHustlePeriod) ||
    !Array.isArray(v.checkpointResults) ||
    v.checkpointResults.length !== checkpointCount ||
    v.checkpointResults.some((r) => !['DONE', 'PARTLY', 'NOT_YET'].includes(String(r))) ||
    !['EASY', 'OK', 'HARD'].includes(String(v.feeling)) ||
    !['ADVANCE', 'CONTINUE', 'REVISE', 'RESELECT'].includes(String(v.decision)) ||
    !(v.note === null || typeof v.note === 'string')
  )
    return invalid();
  if (typeof v.note === 'string' && (v.note.length > 200 || v.note.trim() !== v.note || !v.note))
    return invalid();
  if (
    typeof v.note === 'string' &&
    (findSideHustleExcludedArea(v.note) || findSideHustleGuaranteeExpression(v.note))
  )
    throw new ApplicationError('VALIDATION_ERROR', 'side hustle note unsafe');
  return {
    topicId: v.topicId,
    period: v.period as SideHustlePeriod,
    checkpointResults: v.checkpointResults as SideHustleCheckpointResult[],
    feeling: v.feeling as SideHustleCheckin['feeling'],
    note: v.note,
    decision: v.decision as SideHustleCheckinDecision,
  };
}

export function sideHustleCheckinEligibility(input: {
  period: SideHustlePeriod | 'COMPLETED';
  periodStartedAt: Date | string;
  verifiedPracticeCount: number;
  now: Date | string;
}) {
  const started = new Date(input.periodStartedAt).getTime();
  const now = new Date(input.now).getTime();
  const elapsed =
    Number.isFinite(started) &&
    Number.isFinite(now) &&
    now - started >= SIDE_HUSTLE_STAGE_ADVANCE_MIN_DAYS * 86400000;
  const canAdvance = input.period !== 'COMPLETED' && input.verifiedPracticeCount > 0;
  const suggested =
    input.period !== 'COMPLETED' &&
    (input.verifiedPracticeCount >= SIDE_HUSTLE_STAGE_ADVANCE_PRACTICE_THRESHOLD || elapsed);
  return {
    suggested,
    canAdvance,
    reason:
      input.verifiedPracticeCount >= SIDE_HUSTLE_STAGE_ADVANCE_PRACTICE_THRESHOLD
        ? ('ENOUGH_PRACTICE' as const)
        : elapsed
          ? ('TIME_PASSED' as const)
          : ('NOT_YET' as const),
  };
}

export function buildSideHustleStageRequest(input: {
  previous: {
    originalText: string;
    deviceType: 'SMARTPHONE' | 'PC' | 'BOTH' | null;
    toolDescription: string | null;
    experienceDescription: string | null;
    currentPosition: string | null;
  };
  roadmap: SideHustleRoadmapProposal;
  toPeriod: 'MONTH_2' | 'MONTH_3';
  checkpointResults: SideHustleCheckpointResult[];
}): Omit<typeof input.previous, never> {
  const monthIndex = input.toPeriod === 'MONTH_2' ? 1 : 2;
  const target = input.roadmap.milestones[monthIndex];
  const lineSeparator = input.previous.originalText.includes('\r\n') ? '\r\n' : '\n';
  const lines = input.previous.originalText.split(/\r?\n/);
  const indexes = lines.flatMap((line, index) => (line.startsWith('いまの段階：') ? [index] : []));
  if (indexes.length !== 1 || !target)
    throw new ApplicationError('CONFLICT', 'invalid current stage line');
  lines[indexes[0]!] = `いまの段階：${monthIndex + 1}か月目「${target.title}」`;
  const limit = 500;
  const base = `${monthIndex + 1}か月目の目安：${target.checkpoints.join('／')}`;
  const leftovers = input.roadmap.milestones[monthIndex - 1]!.checkpoints.filter(
    (_, i) => input.checkpointResults[i] !== 'DONE',
  );
  let currentPosition = base;
  if (leftovers.length) {
    const prefix = '（前の月で残ったこと：';
    const suffix = '）';
    const available = Math.max(0, limit - currentPosition.length - prefix.length - suffix.length);
    const retained = [...leftovers];
    while (retained.length && retained.join('／').length > available) retained.shift();
    if (retained.length) currentPosition += `${prefix}${retained.join('／')}${suffix}`;
  }
  return { ...input.previous, originalText: lines.join(lineSeparator), currentPosition };
}
