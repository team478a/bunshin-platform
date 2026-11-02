import type {
  MemberRoadmapDefinition,
  MemberRoadmapMilestoneId,
  MemberRoadmapStageId,
  MemberRoadmapCriterion,
  MemberRoadmapPolicy,
  MemberUsageScope,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export const HASSY_MEMBER_ROADMAP_DEFINITION_VERSION = 'hassy-roadmap-v1';
const stageIds = ['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4', 'STEP_5'] as const;
export const HASSY_MEMBER_ROADMAP_MILESTONES = [
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
type UsageMetric = 'generated' | 'decisions' | 'activeDays';
const usageMetrics: Partial<Record<MemberRoadmapMilestoneId, UsageMetric>> = {
  FIRST_GENERATION: 'generated',
  FIRST_DECISION: 'decisions',
  CONTINUED_ACTIVITY: 'activeDays',
};
/** Fresh definition copies; no mutable shared default or persistence implied. */
export function createHassyMemberRoadmapDefinition(): MemberRoadmapDefinition {
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
          : { kind: 'FACT' as const, fact: key },
      };
    }),
  });
  return {
    version: HASSY_MEMBER_ROADMAP_DEFINITION_VERSION,
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
  const defaults = createHassyMemberRoadmapDefinition();
  defaults.scope = input.scope ? { ...input.scope } : null;
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
              !new Set<string>(HASSY_MEMBER_ROADMAP_MILESTONES).has(item.id) ||
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
    HASSY_MEMBER_ROADMAP_MILESTONES.some((id) => id !== 'REFERRAL_MILESTONE' && !seen.has(id)) ||
    stages
      .slice(0, 4)
      .some((stage) => stage.milestones.some((item) => item.id === 'REFERRAL_MILESTONE'))
  )
    throw invalid();
  if (
    result.version === HASSY_MEMBER_ROADMAP_DEFINITION_VERSION &&
    JSON.stringify(result) !== JSON.stringify(defaults)
  )
    throw invalid();
  return result;
}

export const HASSY_MEMBER_ROADMAP_POLICY: MemberRoadmapPolicy = {
  createDefinition: createHassyMemberRoadmapDefinition,
  validateDefinition: definitionSnapshot,
};
