import { ApplicationError } from '@bunshin/shared';
import type { EffectiveGroupFeatureAccess } from './group-feature-entitlement';
import {
  type GetMemberUsageSummary,
  MEMBER_USAGE_VERSION,
  type MemberUsageRequest,
  type MemberUsageScope,
  type MemberUsageSummary,
} from './member-usage';

export const MEMBER_ROADMAP_VERSION = 'member-roadmap-v1';
export const DEFAULT_MEMBER_ROADMAP_DEFINITION_VERSION = 'hassy-roadmap-v1';
const stageIds = ['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4', 'STEP_5'] as const;
export type MemberRoadmapStageId = (typeof stageIds)[number];
export const MEMBER_ROADMAP_MILESTONES = [
  'INITIAL_SETUP',
  'FIRST_GENERATION',
  'FIRST_DECISION',
  'POST_HISTORY',
  'WEEKLY_PLAN',
  'CONTINUED_ACTIVITY',
  'SNS_CONNECTION_GUIDE',
  'POST_PREPARATION',
  'SCHEDULED_POSTING',
  'SNS_METRICS',
  'POST_ANALYSIS',
  'APPLY_IMPROVEMENT',
  'MUSE_GUIDE',
  'ZAPIER_GUIDE',
  'EXTERNAL_AI',
  'REFERRAL_MILESTONE',
] as const;
export type MemberRoadmapMilestoneId = (typeof MEMBER_ROADMAP_MILESTONES)[number];
type UsageMetric = 'generated' | 'decisions' | 'activeDays';
const usageMetrics: Partial<Record<MemberRoadmapMilestoneId, UsageMetric>> = {
  FIRST_GENERATION: 'generated',
  FIRST_DECISION: 'decisions',
  CONTINUED_ACTIVITY: 'activeDays',
};
export type MemberRoadmapFact = Exclude<
  MemberRoadmapMilestoneId,
  'FIRST_GENERATION' | 'FIRST_DECISION' | 'CONTINUED_ACTIVITY' | 'REFERRAL_MILESTONE'
>;
export type MemberRoadmapCriterion =
  | { kind: 'USAGE'; metric: UsageMetric; target: number }
  | { kind: 'FACT'; fact: MemberRoadmapFact }
  | { kind: 'VALID_REFERRALS'; target: number };
export interface MemberRoadmapDefinition {
  version: string;
  scope: { workspaceId: string; serviceId: string } | null;
  stages: readonly {
    id: MemberRoadmapStageId;
    title: string;
    milestones: readonly {
      id: MemberRoadmapMilestoneId;
      title: string;
      criterion: MemberRoadmapCriterion;
    }[];
  }[];
}
export interface MemberRoadmapFeatureState {
  readyForRecommendation: boolean;
  implemented: boolean;
  enabled: boolean;
  budgetAllowed: boolean;
  access: EffectiveGroupFeatureAccess;
}
export interface MemberRoadmapContext {
  scope: MemberUsageScope;
  asOf: string;
  timezone: string;
  definition: MemberRoadmapDefinition;
  facts: Partial<Record<MemberRoadmapFact, boolean | null>>;
  features: Partial<Record<MemberRoadmapMilestoneId, MemberRoadmapFeatureState>>;
  validReferrals: number | null;
}
export interface MemberRoadmapContextRepository {
  /** Recheck current consent/ownership/access; filter owner-scoped evidence through asOf. */
  read(input: MemberUsageRequest): Promise<MemberRoadmapContext | null>;
}
type DisplayStatus = 'COMPLETED' | 'AVAILABLE' | 'PREPARING';
type AvailabilityReason =
  'AVAILABLE' | 'NOT_IMPLEMENTED' | 'STOPPED' | 'ACCESS_DENIED' | 'BUDGET_DENIED' | 'NOT_RESOLVED';
export interface MemberRoadmapMilestone {
  id: MemberRoadmapMilestoneId;
  title: string;
  status: DisplayStatus;
  reason: AvailabilityReason | 'ACHIEVED' | 'ACTION_AVAILABLE' | 'EVIDENCE_MISSING';
  recommendable: boolean;
  achievement: 'COMPLETED' | 'INCOMPLETE' | 'UNKNOWN';
  availability: { state: 'AVAILABLE' | 'UNAVAILABLE' | 'PREPARING'; reason: AvailabilityReason };
  progress: { current: number | null; target: number };
}
export interface MemberRoadmap {
  version: typeof MEMBER_ROADMAP_VERSION;
  definitionVersion: string;
  scope: MemberUsageScope;
  asOf: string;
  timezone: string;
  currentStageId: MemberRoadmapStageId | null;
  nextRecommended: { stageId: MemberRoadmapStageId; milestoneId: MemberRoadmapMilestoneId } | null;
  stages: {
    id: MemberRoadmapStageId;
    title: string;
    status: DisplayStatus;
    progress: { completed: number; total: number; unknown: number };
    milestones: MemberRoadmapMilestone[];
  }[];
}

/** Fresh definition copies; no mutable shared default or persistence implied. */
export function createDefaultMemberRoadmapDefinition(): MemberRoadmapDefinition {
  const stage = (
    id: MemberRoadmapStageId,
    title: string,
    entries: readonly [MemberRoadmapMilestoneId, string][],
  ) => ({
    id,
    title,
    milestones: entries.map(([key, label]) => {
      const metric = usageMetrics[key];
      return {
        id: key,
        title: label,
        criterion: metric
          ? { kind: 'USAGE' as const, metric, target: key === 'CONTINUED_ACTIVITY' ? 3 : 1 }
          : { kind: 'FACT' as const, fact: key as MemberRoadmapFact },
      };
    }),
  });
  return {
    version: DEFAULT_MEMBER_ROADMAP_DEFINITION_VERSION,
    scope: null,
    stages: [
      stage('STEP_1', 'SNS運用を始める', [
        ['INITIAL_SETUP', '初期設定'],
        ['FIRST_GENERATION', '投稿案生成'],
        ['FIRST_DECISION', '投稿案の採用・不採用'],
      ]),
      stage('STEP_2', '継続して利用する', [
        ['POST_HISTORY', '投稿履歴確認'],
        ['WEEKLY_PLAN', '週間計画'],
        ['CONTINUED_ACTIVITY', '継続利用'],
      ]),
      stage('STEP_3', '投稿の負担を減らす', [
        ['SNS_CONNECTION_GUIDE', 'SNS連携ガイド'],
        ['POST_PREPARATION', '投稿準備支援'],
        ['SCHEDULED_POSTING', '予約投稿'],
      ]),
      stage('STEP_4', '成果を分析する', [
        ['SNS_METRICS', 'SNS実績の取得'],
        ['POST_ANALYSIS', '投稿分析'],
        ['APPLY_IMPROVEMENT', '次の投稿への改善反映'],
      ]),
      stage('STEP_5', '自動化を拡張する', [
        ['MUSE_GUIDE', 'MUSE活用ガイド'],
        ['ZAPIER_GUIDE', 'Zapier連携ガイド'],
        ['EXTERNAL_AI', '外部AI連携'],
      ]),
    ],
  };
}

const invalid = () => new ApplicationError('VALIDATION_ERROR', 'invalid member roadmap snapshot');
const scopeKeys = ['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const;
const sameScope = (a: MemberUsageScope, b: MemberUsageScope) =>
  scopeKeys.every((key) => a[key] === b[key]);
const text = (value: string, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;

function definitionSnapshot(input: MemberRoadmapDefinition, scope: MemberUsageScope) {
  if (
    !input ||
    !text(input.version, 120) ||
    !Array.isArray(input.stages) ||
    input.stages.length !== 5 ||
    (input.scope !== null &&
      (!input.scope ||
        input.scope.workspaceId !== scope.workspaceId ||
        input.scope.serviceId !== scope.serviceId))
  )
    throw invalid();
  const seen = new Set<MemberRoadmapMilestoneId>();
  const defaults = createDefaultMemberRoadmapDefinition();
  const stageFor = new Map(
    defaults.stages.flatMap((stage) =>
      stage.milestones.map((item) => [item.id, stage.id] as const),
    ),
  );
  const stages: MemberRoadmapDefinition['stages'] = input.stages.map(
    (stage: MemberRoadmapDefinition['stages'][number], index: number) => {
      if (
        stage.id !== stageIds[index] ||
        !text(stage.title, 120) ||
        !Array.isArray(stage.milestones) ||
        !stage.milestones.length ||
        stage.milestones.length > 16
      )
        throw invalid();
      return {
        id: stage.id,
        title: stage.title,
        milestones: stage.milestones.map(
          (item: MemberRoadmapDefinition['stages'][number]['milestones'][number]) => {
            if (
              !MEMBER_ROADMAP_MILESTONES.includes(item.id) ||
              (item.id !== 'REFERRAL_MILESTONE' && stageFor.get(item.id) !== stage.id) ||
              seen.has(item.id) ||
              !text(item.title, 120) ||
              !item.criterion
            )
              throw invalid();
            seen.add(item.id);
            const expectedMetric = usageMetrics[item.id];
            const condition = item.criterion;
            let criterion: MemberRoadmapCriterion;
            if (condition.kind === 'USAGE') {
              if (
                !expectedMetric ||
                expectedMetric !== condition.metric ||
                !count(condition.target) ||
                condition.target < 1 ||
                condition.target > 1_000_000
              )
                throw invalid();
              criterion = { kind: 'USAGE', metric: condition.metric, target: condition.target };
            } else if (condition.kind === 'VALID_REFERRALS') {
              if (
                item.id !== 'REFERRAL_MILESTONE' ||
                !count(condition.target) ||
                condition.target < 1 ||
                condition.target > 1_000_000
              )
                throw invalid();
              criterion = { kind: 'VALID_REFERRALS', target: condition.target };
            } else {
              if (
                condition.kind !== 'FACT' ||
                expectedMetric ||
                item.id === 'REFERRAL_MILESTONE' ||
                condition.fact !== item.id
              )
                throw invalid();
              criterion = { kind: 'FACT', fact: condition.fact };
            }
            return { id: item.id, title: item.title, criterion };
          },
        ),
      };
    },
  );
  const result: MemberRoadmapDefinition = {
    version: input.version,
    scope: input.scope ? { ...input.scope } : null,
    stages,
  };
  if (
    MEMBER_ROADMAP_MILESTONES.some((id) => id !== 'REFERRAL_MILESTONE' && !seen.has(id)) ||
    stages
      .slice(0, 4)
      .some((stage) => stage.milestones.some((item) => item.id === 'REFERRAL_MILESTONE'))
  )
    throw invalid();
  if (
    result.version === DEFAULT_MEMBER_ROADMAP_DEFINITION_VERSION &&
    JSON.stringify(result) !== JSON.stringify(defaults)
  )
    throw invalid();
  return result;
}

function available(
  value: MemberRoadmapFeatureState | undefined,
): MemberRoadmapMilestone['availability'] {
  if (!value) return { state: 'PREPARING', reason: 'NOT_RESOLVED' };
  if (!value.implemented) return { state: 'PREPARING', reason: 'NOT_IMPLEMENTED' };
  if (!value.enabled) return { state: 'UNAVAILABLE', reason: 'STOPPED' };
  if (!value.access.allowed) return { state: 'UNAVAILABLE', reason: 'ACCESS_DENIED' };
  if (!value.budgetAllowed) return { state: 'UNAVAILABLE', reason: 'BUDGET_DENIED' };
  return { state: 'AVAILABLE', reason: 'AVAILABLE' };
}

/** Pure projection. Call the authorized use case at runtime; this is not an access grant. */
export function evaluateMemberRoadmap(
  request: MemberUsageRequest,
  usage: MemberUsageSummary,
  context: MemberRoadmapContext,
): MemberRoadmap {
  if (
    scopeKeys.some((key) => !text(request.scope[key], 120)) ||
    request.actorUserId !== request.scope.userId ||
    !Number.isFinite(request.asOf.getTime()) ||
    !text(request.timezone, 64) ||
    usage.version !== MEMBER_USAGE_VERSION ||
    !sameScope(request.scope, usage.scope) ||
    !sameScope(request.scope, context.scope) ||
    usage.asOf !== request.asOf.toISOString() ||
    context.asOf !== usage.asOf ||
    request.timezone !== usage.timezone ||
    context.timezone !== usage.timezone
  )
    throw invalid();
  try {
    new Intl.DateTimeFormat('sv-SE', { timeZone: request.timezone }).format(request.asOf);
  } catch {
    throw invalid();
  }
  const definition = definitionSnapshot(context.definition, request.scope);
  const values = {
    generated: usage.allTime.generated,
    decisions: usage.allTime.accepted + usage.allTime.rejected,
    activeDays: usage.allTime.activeDays,
  };
  if (
    [usage.allTime.accepted, usage.allTime.rejected, ...Object.values(values)].some(
      (value) => !count(value),
    ) ||
    (context.validReferrals !== null && !count(context.validReferrals))
  )
    throw invalid();
  if (
    !context.facts ||
    !context.features ||
    typeof context.facts !== 'object' ||
    typeof context.features !== 'object'
  )
    throw invalid();
  for (const [key, value] of Object.entries(context.facts)) {
    if (
      !MEMBER_ROADMAP_MILESTONES.includes(key as MemberRoadmapMilestoneId) ||
      usageMetrics[key as MemberRoadmapMilestoneId] ||
      key === 'REFERRAL_MILESTONE' ||
      (value !== null && typeof value !== 'boolean')
    )
      throw invalid();
  }
  for (const [key, value] of Object.entries(context.features)) {
    if (
      !MEMBER_ROADMAP_MILESTONES.includes(key as MemberRoadmapMilestoneId) ||
      !value ||
      typeof value.implemented !== 'boolean' ||
      typeof value.enabled !== 'boolean' ||
      typeof value.budgetAllowed !== 'boolean' ||
      typeof value.readyForRecommendation !== 'boolean' ||
      !value.access ||
      typeof value.access.allowed !== 'boolean' ||
      !text(value.access.reason, 80) ||
      value.access.allowed !== (value.access.reason === 'ALLOWED')
    )
      throw invalid();
  }
  const stages: MemberRoadmap['stages'] = definition.stages.map((stage) => {
    const milestones = stage.milestones.map((item): MemberRoadmapMilestone => {
      const condition = item.criterion;
      const fact =
        condition.kind === 'FACT' && Object.hasOwn(context.facts, condition.fact)
          ? context.facts[condition.fact]
          : null;
      const current =
        condition.kind === 'USAGE'
          ? values[condition.metric]
          : condition.kind === 'VALID_REFERRALS'
            ? context.validReferrals
            : fact == null
              ? null
              : Number(fact);
      const target = condition.kind === 'FACT' ? 1 : condition.target;
      const achievement =
        current === null ? 'UNKNOWN' : current >= target ? 'COMPLETED' : 'INCOMPLETE';
      const availability = available(
        Object.hasOwn(context.features, item.id) ? context.features[item.id] : undefined,
      );
      return {
        id: item.id,
        title: item.title,
        achievement,
        availability,
        status:
          achievement === 'COMPLETED'
            ? 'COMPLETED'
            : achievement === 'INCOMPLETE' && availability.state === 'AVAILABLE'
              ? 'AVAILABLE'
              : 'PREPARING',
        reason:
          achievement === 'COMPLETED'
            ? 'ACHIEVED'
            : availability.state !== 'AVAILABLE'
              ? availability.reason
              : achievement === 'UNKNOWN'
                ? 'EVIDENCE_MISSING'
                : 'ACTION_AVAILABLE',
        recommendable:
          achievement === 'INCOMPLETE' &&
          availability.state === 'AVAILABLE' &&
          context.features[item.id]?.readyForRecommendation === true,
        progress: { current, target },
      };
    });
    const completed = milestones.filter((item) => item.achievement === 'COMPLETED').length;
    return {
      id: stage.id,
      title: stage.title,
      milestones,
      status:
        completed === milestones.length
          ? 'COMPLETED'
          : milestones.some((item) => item.status === 'AVAILABLE')
            ? 'AVAILABLE'
            : 'PREPARING',
      progress: {
        completed,
        total: milestones.length,
        unknown: milestones.filter((item) => item.achievement === 'UNKNOWN').length,
      },
    };
  });
  const nextStage = stages.find((stage) => stage.milestones.some((item) => item.recommendable));
  const next = nextStage?.milestones.find((item) => item.recommendable);
  return {
    version: MEMBER_ROADMAP_VERSION,
    definitionVersion: definition.version,
    scope: { ...request.scope },
    asOf: usage.asOf,
    timezone: usage.timezone,
    stages,
    currentStageId: stages.find((stage) => stage.status !== 'COMPLETED')?.id ?? null,
    nextRecommended: nextStage && next ? { stageId: nextStage.id, milestoneId: next.id } : null,
  };
}

export class GetMemberRoadmap {
  constructor(
    private readonly usage: Pick<GetMemberUsageSummary, 'execute'>,
    private readonly context: MemberRoadmapContextRepository,
  ) {}

  async execute(input: MemberUsageRequest): Promise<MemberRoadmap> {
    const request = { ...input, scope: { ...input.scope }, asOf: new Date(input.asOf) };
    if (
      request.actorUserId !== request.scope.userId ||
      scopeKeys.some((key) => !text(request.scope[key], 120)) ||
      !Number.isFinite(request.asOf.getTime()) ||
      !text(request.timezone, 64)
    )
      throw invalid();
    const copy = () => ({ ...request, scope: { ...request.scope }, asOf: new Date(request.asOf) });
    const usage = await this.usage.execute(copy());
    const context = await this.context.read(copy());
    if (!context) throw new ApplicationError('NOT_FOUND', 'member roadmap unavailable');
    return evaluateMemberRoadmap(request, usage, context);
  }
}
