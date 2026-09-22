import {
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

import { assertPlatformFormat } from './mission-content';
import type { SocialPlatform, SocialPreferredFormat } from './social-profile';
import { isOneOf } from './social-validation';
export const TREND_EVIDENCE_SOURCE_TYPES = ['OFFICIAL_API', 'PUBLIC_WEB', 'NEWS', 'OTHER'] as const;
export type TrendEvidenceSourceType = (typeof TREND_EVIDENCE_SOURCE_TYPES)[number];
export const TREND_SAFETY_STATUSES = ['SAFE', 'REVIEW_REQUIRED', 'REJECTED'] as const;
export type TrendSafetyStatus = (typeof TREND_SAFETY_STATUSES)[number];

export interface TrendEvidence {
  id: string;
  sourceType: TrendEvidenceSourceType;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: Date | null;
  retrievedAt: Date;
  summary: string;
  evidenceHash: string;
  expiresAt: Date;
}
export interface TrendIdeaCandidate {
  id: string;
  platform: SocialPlatform;
  topic: string;
  hook: string;
  whyNow: string;
  fitReason: string;
  suggestedFormat: SocialPreferredFormat;
  estimatedMinutes: number;
  freshnessScore: number;
  fitScore: number;
  feasibilityScore: number;
  safetyStatus: TrendSafetyStatus;
  expiresAt: Date;
  evidenceIds: string[];
}
export interface TrendResearchRun {
  id: string;
  workspaceId: string;
  bunshinId: string;
  socialProfileId: string;
  periodStart: string;
  periodEnd: string;
  queryVersion: string;
  providerKey: string;
  completedAt: Date;
  expiresAt: Date;
  evidence: TrendEvidence[];
  candidates: TrendIdeaCandidate[];
}
export interface CreateCompletedTrendResearchInput {
  workspaceId: string;
  actorUserId: string;
  bunshinId: string;
  socialProfileId: string;
  platform: SocialPlatform;
  periodStart: string;
  periodEnd: string;
  queryVersion: string;
  providerKey: string;
  completedAt: Date;
  expiresAt: Date;
  evidence: Array<{
    key: string;
    sourceType: TrendEvidenceSourceType;
    sourceUrl: string;
    sourceTitle: string;
    publishedAt?: Date | null;
    retrievedAt: Date;
    summary: string;
    evidenceHash: string;
    expiresAt: Date;
  }>;
  candidates: Array<{
    platform: SocialPlatform;
    topic: string;
    hook: string;
    whyNow: string;
    fitReason: string;
    suggestedFormat: SocialPreferredFormat;
    estimatedMinutes: number;
    freshnessScore: number;
    fitScore: number;
    feasibilityScore: number;
    safetyStatus: TrendSafetyStatus;
    expiresAt: Date;
    evidenceKeys: string[];
  }>;
}
export interface TrendResearchRepository {
  createCompleted(input: CreateCompletedTrendResearchInput): Promise<TrendResearchRun | null>;
  listActive(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    socialProfileId: string;
    at: Date;
  }): Promise<TrendIdeaCandidate[] | null>;
}

function trendText(value: string, maximum: number, field: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
}
function trendLocalDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
}
function trendTimestamp(value: Date, field: string) {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf()))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
}
function trendScore(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
}
function trendUrl(value: string) {
  let url: URL;
  try {
    url = new URL(trendText(value, 2048, 'source url'));
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid source url', error);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'unsafe source url');
  return url.toString();
}
export function normalizeCompletedTrendResearchInput(input: CreateCompletedTrendResearchInput) {
  const periodStart = trendLocalDate(input.periodStart, 'period start');
  const periodEnd = trendLocalDate(input.periodEnd, 'period end');
  if (periodEnd < periodStart) throw new ApplicationError('VALIDATION_ERROR', 'invalid period');
  const completedAt = trendTimestamp(input.completedAt, 'completed at');
  const expiresAt = trendTimestamp(input.expiresAt, 'expires at');
  if (expiresAt <= completedAt)
    throw new ApplicationError('VALIDATION_ERROR', 'run must expire later');
  if (input.evidence.length < 1 || input.evidence.length > 10)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence count');
  if (input.candidates.length < 1 || input.candidates.length > 3)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid candidate count');
  const keys = new Set<string>();
  const hashes = new Set<string>();
  const evidence = input.evidence.map((item) => {
    const key = trendText(item.key, 80, 'evidence key');
    const evidenceHash = item.evidenceHash.toLowerCase();
    if (keys.has(key)) throw new ApplicationError('VALIDATION_ERROR', 'duplicate evidence key');
    if (!isOneOf(item.sourceType, TREND_EVIDENCE_SOURCE_TYPES))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence source');
    if (!/^[a-f0-9]{64}$/.test(evidenceHash) || hashes.has(evidenceHash))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence hash');
    keys.add(key);
    hashes.add(evidenceHash);
    const retrievedAt = trendTimestamp(item.retrievedAt, 'retrieved at');
    const itemExpiresAt = trendTimestamp(item.expiresAt, 'evidence expires at');
    if (itemExpiresAt <= retrievedAt)
      throw new ApplicationError('VALIDATION_ERROR', 'evidence must expire later');
    return {
      ...item,
      key,
      sourceUrl: trendUrl(item.sourceUrl),
      sourceTitle: trendText(item.sourceTitle, 500, 'source title'),
      publishedAt:
        item.publishedAt == null ? null : trendTimestamp(item.publishedAt, 'published at'),
      retrievedAt,
      summary: trendText(item.summary, 2000, 'summary'),
      evidenceHash,
      expiresAt: itemExpiresAt,
    };
  });
  const candidates = input.candidates.map((item) => {
    if (item.platform !== input.platform)
      throw new ApplicationError('VALIDATION_ERROR', 'platform mismatch');
    assertPlatformFormat(item.platform, item.suggestedFormat);
    if (!isOneOf(item.safetyStatus, TREND_SAFETY_STATUSES))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid safety status');
    if (
      item.evidenceKeys.length < 1 ||
      new Set(item.evidenceKeys).size !== item.evidenceKeys.length ||
      item.evidenceKeys.some((key) => !keys.has(key))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid candidate evidence');
    if (
      !Number.isInteger(item.estimatedMinutes) ||
      item.estimatedMinutes < 1 ||
      item.estimatedMinutes > 120
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid estimated minutes');
    const itemExpiresAt = trendTimestamp(item.expiresAt, 'candidate expires at');
    if (itemExpiresAt <= completedAt)
      throw new ApplicationError('VALIDATION_ERROR', 'candidate must expire later');
    return {
      ...item,
      topic: trendText(item.topic, 200, 'topic'),
      hook: trendText(item.hook, 500, 'hook'),
      whyNow: trendText(item.whyNow, 1000, 'why now'),
      fitReason: trendText(item.fitReason, 1000, 'fit reason'),
      freshnessScore: trendScore(item.freshnessScore, 'freshness score'),
      fitScore: trendScore(item.fitScore, 'fit score'),
      feasibilityScore: trendScore(item.feasibilityScore, 'feasibility score'),
      expiresAt: itemExpiresAt,
    };
  });
  return {
    ...input,
    periodStart,
    periodEnd,
    queryVersion: trendText(input.queryVersion, 120, 'query version'),
    providerKey: trendText(input.providerKey, 40, 'provider key'),
    completedAt,
    expiresAt,
    evidence,
    candidates,
  };
}
export class CreateCompletedTrendResearch {
  constructor(
    private readonly research: TrendResearchRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  async execute(input: CreateCompletedTrendResearchInput) {
    const normalized = normalizeCompletedTrendResearchInput(input);
    await new RequireActiveBunshinCapability(this.assignments).execute({
      workspaceId: normalized.workspaceId,
      actorUserId: normalized.actorUserId,
      bunshinId: normalized.bunshinId,
      capabilityType: 'SOCIAL',
    });
    const value = await this.research.createCompleted(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'trend research scope not found');
    return value;
  }
}
export class ListActiveTrendIdeas {
  constructor(private readonly research: TrendResearchRepository) {}
  async execute(input: Parameters<TrendResearchRepository['listActive']>[0]) {
    trendTimestamp(input.at, 'at');
    const values = await this.research.listActive(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'trend research scope not found');
    return values;
  }
}

export interface RankTrendIdeaCandidatesInput {
  candidates: TrendIdeaCandidate[];
  platform: SocialPlatform;
  format: SocialPreferredFormat;
  availableMinutes: number;
  at: Date;
  maximum?: number;
}

export interface RankedTrendIdeaCandidate extends TrendIdeaCandidate {
  rankingScore: number;
}

export function rankTrendIdeaCandidates(
  input: RankTrendIdeaCandidatesInput,
): RankedTrendIdeaCandidate[] {
  trendTimestamp(input.at, 'ranking at');
  if (!Number.isInteger(input.availableMinutes) || input.availableMinutes < 1)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid ranking time budget');
  const maximum = input.maximum ?? 3;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 3)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid ranking candidate limit');
  assertPlatformFormat(input.platform, input.format);
  return input.candidates
    .filter(
      (candidate) =>
        candidate.platform === input.platform &&
        candidate.suggestedFormat === input.format &&
        candidate.safetyStatus === 'SAFE' &&
        candidate.expiresAt > input.at &&
        candidate.estimatedMinutes <= input.availableMinutes &&
        candidate.evidenceIds.length > 0,
    )
    .map((candidate) => ({
      ...candidate,
      rankingScore:
        candidate.fitScore * 40 + candidate.freshnessScore * 35 + candidate.feasibilityScore * 25,
    }))
    .sort(
      (left, right) =>
        right.rankingScore - left.rankingScore ||
        right.fitScore - left.fitScore ||
        left.id.localeCompare(right.id),
    )
    .slice(0, maximum);
}
