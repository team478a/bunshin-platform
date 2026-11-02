import { ApplicationError } from '@bunshin/shared';

export const MEMBER_USAGE_VERSION = 'member-usage-v1';

export interface MemberUsageScope {
  workspaceId: string;
  serviceId: string;
  groupMembershipId: string;
  userId: string;
  bunshinId: string;
}

interface UsageRecord {
  id: string;
  scope: MemberUsageScope;
  occurredAt: Date;
}

export interface MemberUsageSources {
  scope: MemberUsageScope;
  /** All source rows through asOf, in a consistent snapshot; never a truncated page. */
  completeness: 'COMPLETE' | 'PARTIAL';
  generations: readonly (UsageRecord & {
    status: 'SUCCESS' | 'FAILED';
    trigger: 'USER' | 'SCHEDULER' | 'SYSTEM' | 'UNKNOWN';
  })[];
  activities: readonly (UsageRecord & { dailyMissionId: string; type: string })[];
  decisions: readonly (UsageRecord & {
    dailyMissionId: string;
    decision: 'ACCEPTED' | 'REJECTED';
  })[];
  /** occurredAt maps to createdAt (report time), not the user-supplied postedAt. */
  postRecords: readonly (UsageRecord & { dailyMissionId: string })[];
  aiUsage: readonly (UsageRecord & { estimatedCostUsdMicros: bigint | null })[];
}

export interface MemberUsageRequest {
  actorUserId: string;
  scope: MemberUsageScope;
  asOf: Date;
  timezone: string;
}

export interface MemberUsageAuthorizationPort {
  /** Revalidate ACTIVE workspace/service/membership, consent and Bunshin ownership. */
  authorize(input: MemberUsageRequest): Promise<boolean>;
}

export interface MemberUsageSourceRepository {
  /** Apply the complete owner/service scope to every query; no Memory/content is needed. */
  read(input: MemberUsageRequest): Promise<MemberUsageSources | null>;
}

export interface MemberUsageMetrics {
  generated: number;
  unknownTriggerGenerations: number;
  accepted: number;
  rejected: number;
  selfReportedPosts: number;
  activeDays: number;
  lastActiveAt: string | null;
  aiCost: { knownUsdMicros: string; unknownEvents: number };
}

export interface MemberUsageSummary {
  version: typeof MEMBER_USAGE_VERSION;
  scope: MemberUsageScope;
  asOf: string;
  timezone: string;
  allTime: MemberUsageMetrics;
  last7Days: MemberUsageMetrics & { fromLocalDate: string; throughLocalDate: string };
  last30Days: MemberUsageMetrics & { fromLocalDate: string; throughLocalDate: string };
}

const scopeKeys = ['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const;
const copies = new Set([
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
]);
const invalid = () => new ApplicationError('VALIDATION_ERROR', 'invalid member usage source');
const sameScope = (a: MemberUsageScope, b: MemberUsageScope) =>
  scopeKeys.every((key) => a[key] === b[key]);

function validateScopeRequest(request: Omit<MemberUsageRequest, 'actorUserId'>) {
  if (
    scopeKeys.some((key) => !request.scope[key]?.trim()) ||
    !Number.isFinite(request.asOf.getTime())
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid member usage request');
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: request.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid member usage timezone');
  }
}

function validateRequest(request: MemberUsageRequest) {
  if (request.actorUserId !== request.scope.userId)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid member usage request');
  return validateScopeRequest(request);
}

function daysBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

/** In-memory projection only. Does not authorize access or persist duplicate events. */
function usageProjection(
  request: Omit<MemberUsageRequest, 'actorUserId'>,
  sources: MemberUsageSources,
) {
  const formatter = validateScopeRequest(request);
  if (!sameScope(request.scope, sources.scope) || sources.completeness !== 'COMPLETE')
    throw invalid();

  function eligible<T extends UsageRecord>(rows: readonly T[]): T[] {
    const unique = new Map<string, T>();
    for (const row of rows) {
      if (
        !sameScope(row.scope, request.scope) ||
        !row.id.trim() ||
        !Number.isFinite(row.occurredAt.getTime())
      )
        throw invalid();
      // Exact source replay is harmless; conflicting replay must not silently change a metric.
      const prior = unique.get(row.id);
      const fingerprint = (value: T) =>
        JSON.stringify(value, (_, field: unknown) =>
          typeof field === 'bigint' ? field.toString() : field,
        );
      if (prior && fingerprint(prior) !== fingerprint(row)) throw invalid();
      unique.set(row.id, row);
    }
    return [...unique.values()].filter((row) => row.occurredAt <= request.asOf);
  }

  const generations = eligible(sources.generations);
  const activities = eligible(sources.activities);
  const decisions = eligible(sources.decisions);
  const posts = eligible(sources.postRecords);
  const ai = eligible(sources.aiUsage);
  const byTime = (a: UsageRecord, b: UsageRecord) =>
    a.occurredAt.getTime() - b.occurredAt.getTime();
  const decisionEvents = new Map<string, UsageRecord & { decision: 'ACCEPTED' | 'REJECTED' }>();
  const postedEvents = new Map<string, UsageRecord>();
  for (const row of [...activities].sort(byTime)) {
    if (!row.dailyMissionId.trim()) throw invalid();
    if (row.type === 'ACCEPTED' || row.type === 'REJECTED') {
      const key = JSON.stringify([row.dailyMissionId, row.type]);
      if (!decisionEvents.has(key)) decisionEvents.set(key, { ...row, decision: row.type });
    }
    if (row.type === 'POSTED' && !postedEvents.has(row.dailyMissionId))
      postedEvents.set(row.dailyMissionId, row);
  }
  for (const row of [...decisions].sort(byTime)) {
    if (!row.dailyMissionId.trim()) throw invalid();
    const key = JSON.stringify([row.dailyMissionId, row.decision]);
    if (!decisionEvents.has(key)) decisionEvents.set(key, row);
  }
  for (const row of [...posts].sort(byTime)) {
    if (!row.dailyMissionId.trim()) throw invalid();
    if (!postedEvents.has(row.dailyMissionId)) postedEvents.set(row.dailyMissionId, row);
  }
  if (ai.some((row) => row.estimatedCostUsdMicros !== null && row.estimatedCostUsdMicros < 0n))
    throw invalid();

  const generated = generations.filter((row) => row.status === 'SUCCESS');
  const selected = [...decisionEvents.values()];
  const reported = [...postedEvents.values()];
  const copied = activities.filter((row) => copies.has(row.type));
  const active = [
    ...generated.filter((row) => row.trigger === 'USER'),
    ...selected,
    ...reported,
    ...copied,
  ];
  return {
    formatter,
    generated,
    selected,
    reported,
    active,
    ai,
    copied,
  };
}

/** Canonical SOCIAL usage metadata shared with metrics. Does not authorize or choose referral conditions. */
export function projectMemberUsageEvidence(
  request: MemberUsageRequest,
  sources: MemberUsageSources,
) {
  validateRequest(request);
  return projectScopedUsageEvidence(request, sources);
}

/** Pure metadata projection after external authorization; never represents an acting user. */
export function projectScopedUsageEvidence(
  request: Omit<MemberUsageRequest, 'actorUserId'>,
  sources: MemberUsageSources,
) {
  const { generated, selected, reported, copied } = usageProjection(request, sources);
  return { generations: generated, decisions: selected, postRecords: reported, copies: copied };
}

/** In-memory metrics only. Does not authorize access or persist duplicate events. */
export function aggregateMemberUsage(
  request: MemberUsageRequest,
  sources: MemberUsageSources,
): MemberUsageSummary {
  validateRequest(request);
  const { formatter, generated, selected, reported, active, ai } = usageProjection(
    request,
    sources,
  );
  const byTime = (a: UsageRecord, b: UsageRecord) =>
    a.occurredAt.getTime() - b.occurredAt.getTime();
  const today = formatter.format(request.asOf);
  function metrics(from: string | null): MemberUsageMetrics {
    const inWindow = (row: UsageRecord) =>
      from === null || formatter.format(row.occurredAt) >= from;
    const activeRows = active.filter(inWindow).sort(byTime);
    const costs = ai.filter(inWindow);
    return {
      generated: generated.filter(inWindow).length,
      unknownTriggerGenerations: generated.filter(
        (row) => row.trigger === 'UNKNOWN' && inWindow(row),
      ).length,
      accepted: selected.filter((row) => row.decision === 'ACCEPTED' && inWindow(row)).length,
      rejected: selected.filter((row) => row.decision === 'REJECTED' && inWindow(row)).length,
      selfReportedPosts: reported.filter(inWindow).length,
      activeDays: new Set(activeRows.map((row) => formatter.format(row.occurredAt))).size,
      lastActiveAt: activeRows.at(-1)?.occurredAt.toISOString() ?? null,
      aiCost: {
        knownUsdMicros: costs
          .reduce((total, row) => total + (row.estimatedCostUsdMicros ?? 0n), 0n)
          .toString(),
        unknownEvents: costs.filter((row) => row.estimatedCostUsdMicros === null).length,
      },
    };
  }
  const seven = daysBefore(today, 6);
  const thirty = daysBefore(today, 29);
  return {
    version: MEMBER_USAGE_VERSION,
    scope: { ...request.scope },
    asOf: request.asOf.toISOString(),
    timezone: request.timezone,
    allTime: metrics(null),
    last7Days: { ...metrics(seven), fromLocalDate: seven, throughLocalDate: today },
    last30Days: { ...metrics(thirty), fromLocalDate: thirty, throughLocalDate: today },
  };
}

export class GetMemberUsageSummary {
  constructor(
    private readonly authorization: MemberUsageAuthorizationPort,
    private readonly sources: MemberUsageSourceRepository,
  ) {}

  async execute(input: MemberUsageRequest): Promise<MemberUsageSummary> {
    const request = { ...input, scope: { ...input.scope }, asOf: new Date(input.asOf) };
    validateRequest(request);
    const copy = () => ({ ...request, scope: { ...request.scope }, asOf: new Date(request.asOf) });
    if (!(await this.authorization.authorize(copy())))
      throw new ApplicationError('NOT_FOUND', 'member usage unavailable');
    const source = await this.sources.read(copy());
    if (!source) throw new ApplicationError('NOT_FOUND', 'member usage unavailable');
    return aggregateMemberUsage(request, source);
  }
}
