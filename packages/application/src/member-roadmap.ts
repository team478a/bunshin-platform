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
export type MemberRoadmapStageId = string;
export type MemberRoadmapMilestoneId = string;
export type MemberRoadmapFact = string;
type UsageMetric = 'generated' | 'decisions' | 'activeDays';
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
export interface MemberRoadmapEvidenceContext {
  scope: MemberUsageScope;
  asOf: string;
  timezone: string;
  facts: Partial<Record<MemberRoadmapFact, boolean | null>>;
  features: Partial<Record<MemberRoadmapMilestoneId, MemberRoadmapFeatureState>>;
  validReferrals: number | null;
}
export interface MemberRoadmapContext extends MemberRoadmapEvidenceContext {
  definition: MemberRoadmapDefinition;
}
export interface MemberRoadmapPolicy {
  createDefinition(scope: MemberUsageScope): MemberRoadmapDefinition;
  validateDefinition(definition: MemberRoadmapDefinition, scope: MemberUsageScope): void;
}
export interface MemberRoadmapContextRepository {
  /** Recheck current consent/ownership/access; filter owner-scoped evidence through asOf. */
  read(input: MemberUsageRequest): Promise<MemberRoadmapEvidenceContext | null>;
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
  validReferrals: number | null;
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

const invalid = () => new ApplicationError('VALIDATION_ERROR', 'invalid member roadmap snapshot');
const scopeKeys = ['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const;
const sameScope = (a: MemberUsageScope, b: MemberUsageScope) =>
  scopeKeys.every((key) => a[key] === b[key]);
const text = (value: string, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const count = (value: number) => Number.isSafeInteger(value) && value >= 0;

function definitionSnapshot(
  input: MemberRoadmapDefinition,
  scope: MemberUsageScope,
): MemberRoadmapDefinition {
  if (
    !input ||
    !text(input.version, 120) ||
    !Array.isArray(input.stages) ||
    input.stages.length < 1 ||
    input.stages.length > 20 ||
    (input.scope !== null &&
      (!input.scope ||
        input.scope.workspaceId !== scope.workspaceId ||
        input.scope.serviceId !== scope.serviceId))
  )
    throw invalid();
  const stageIds = new Set<string>();
  const milestones = new Set<string>();
  const stages = input.stages.map((stage: MemberRoadmapDefinition['stages'][number]) => {
    if (
      !text(stage.id, 120) ||
      stageIds.has(stage.id) ||
      !text(stage.title, 120) ||
      !Array.isArray(stage.milestones) ||
      stage.milestones.length < 1 ||
      stage.milestones.length > 100
    )
      throw invalid();
    stageIds.add(stage.id);
    return {
      id: stage.id,
      title: stage.title,
      milestones: stage.milestones.map(
        (item: MemberRoadmapDefinition['stages'][number]['milestones'][number]) => {
          if (
            !item ||
            !text(item.id, 120) ||
            milestones.has(item.id) ||
            !text(item.title, 120) ||
            !item.criterion
          )
            throw invalid();
          milestones.add(item.id);
          const c = item.criterion;
          let criterion: MemberRoadmapCriterion;
          if (c.kind === 'FACT') {
            if (!text(c.fact, 120)) throw invalid();
            criterion = { kind: 'FACT', fact: c.fact };
          } else {
            if (!count(c.target) || c.target < 1 || c.target > 1_000_000) throw invalid();
            if (c.kind === 'USAGE') {
              if (!['generated', 'decisions', 'activeDays'].includes(c.metric)) throw invalid();
              criterion = { kind: 'USAGE', metric: c.metric, target: c.target };
            } else if (c.kind === 'VALID_REFERRALS')
              criterion = { kind: 'VALID_REFERRALS', target: c.target };
            else throw invalid();
          }
          return { id: item.id, title: item.title, criterion };
        },
      ),
    };
  });
  if (milestones.size > 200) throw invalid();
  return { version: input.version, scope: input.scope ? { ...input.scope } : null, stages };
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
  policy: MemberRoadmapPolicy,
): MemberRoadmap {
  if (
    !policy ||
    typeof policy.createDefinition !== 'function' ||
    typeof policy.validateDefinition !== 'function'
  )
    throw invalid();
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
  policy.validateDefinition(definition, request.scope);
  const declared = definition.stages.flatMap((stage) => stage.milestones);
  const milestoneIds = new Set(declared.map((item) => item.id));
  const factIds = new Set(
    declared.flatMap((item) => (item.criterion.kind === 'FACT' ? [item.criterion.fact] : [])),
  );
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
    if (!factIds.has(key) || (value !== null && typeof value !== 'boolean')) throw invalid();
  }
  for (const [key, value] of Object.entries(context.features)) {
    if (
      !milestoneIds.has(key) ||
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
    validReferrals: context.validReferrals,
    currentStageId: stages.find((stage) => stage.status !== 'COMPLETED')?.id ?? null,
    nextRecommended: nextStage && next ? { stageId: nextStage.id, milestoneId: next.id } : null,
  };
}

export class GetMemberRoadmap {
  constructor(
    private readonly usage: Pick<GetMemberUsageSummary, 'execute'>,
    private readonly context: MemberRoadmapContextRepository,
    private readonly policy: MemberRoadmapPolicy,
  ) {}

  async execute(input: MemberUsageRequest): Promise<MemberRoadmap> {
    return (await this.executeWithUsage(input)).roadmap;
  }

  /** One authorized usage read feeds both the evaluation and the caller's display. */
  async executeWithUsage(
    input: MemberUsageRequest,
  ): Promise<{ roadmap: MemberRoadmap; usage: MemberUsageSummary }> {
    if (
      !this.policy ||
      typeof this.policy.createDefinition !== 'function' ||
      typeof this.policy.validateDefinition !== 'function'
    )
      throw invalid();
    const request = { ...input, scope: { ...input.scope }, asOf: new Date(input.asOf) };
    if (
      request.actorUserId !== request.scope.userId ||
      scopeKeys.some((key) => !text(request.scope[key], 120)) ||
      !Number.isFinite(request.asOf.getTime()) ||
      !text(request.timezone, 64)
    )
      throw invalid();
    const copy = () => ({ ...request, scope: { ...request.scope }, asOf: new Date(request.asOf) });
    const definition = definitionSnapshot(
      this.policy.createDefinition(copy().scope),
      request.scope,
    );
    this.policy.validateDefinition(definition, request.scope);
    const usage = await this.usage.execute(copy());
    const context = await this.context.read(copy());
    if (!context) throw new ApplicationError('NOT_FOUND', 'member roadmap unavailable');
    const roadmap = evaluateMemberRoadmap(request, usage, { ...context, definition }, this.policy);
    return { roadmap, usage };
  }
}
