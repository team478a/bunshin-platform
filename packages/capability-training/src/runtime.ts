import type { NextActionDecision, NextActionPolicy } from '@bunshin/application';
import type {
  AiTrainingV1DecisionContext,
  TrainingActionKey,
  TrainingAiLevel,
  TrainingRole,
} from './index';
import type {
  TrainingChallengeKey,
  TrainingGoalKey,
  TrainingTopicKey,
  TrainingUseCaseKey,
} from './learning-catalog';
import {
  AI_TRAINING_MISSION_QUALITY_VERSION,
  getAiTrainingMissionQuality,
  type TrainingMissionDifficulty,
  type TrainingMissionQualityDefinition,
} from './mission-quality';
import {
  AI_TRAINING_PERSONALIZATION_VERSION,
  RuleBasedTrainingMissionPersonalizer,
  resolveTrainingWorkContext,
  type TrainingMissionPersonalizer,
  type TrainingWorkContext,
} from './personalization';
import {
  isTrainingBarrierReason,
  resolveTrainingBarrierAdjustment,
  type TrainingBarrierReason,
  type TrainingMissionVariant,
  type TrainingPracticeMode,
} from './barrier';

export interface AiTrainingStandardVariantSnapshot {
  title: string;
  task: string;
  instructions: string[];
  estimatedMinutes: number | null;
  constraints: readonly string[];
  successCriteria: readonly string[];
  evaluationCriteria: readonly string[];
  difficulty: TrainingMissionDifficulty;
  difficultyGuidance: string;
}

export interface AiTrainingRuntimeSettings {
  moduleKey: 'AI_TRAINING_V1';
  pauseAfterDays: number;
  routeKey: string;
}

export interface TrainingMissionDefinition {
  key: TrainingActionKey;
  routeKey: string;
  phaseKey: 'FOUNDATION' | 'PRACTICE' | 'APPLICATION';
  title: string;
  estimatedMinutes: number | null;
  quality: TrainingMissionQualityDefinition;
}

export interface AiTrainingActionDisplaySnapshot {
  schemaVersion: 1 | 2 | 3 | 4 | 5;
  actionKey: TrainingActionKey;
  mode: 'WORK' | 'WAIT';
  reasonCode: string;
  title: string;
  reason: string;
  task: string;
  instructions: string[];
  estimatedMinutes: number | null;
  renderer:
    | 'TRAINING_FIXED_V1'
    | 'TRAINING_PRACTICE_V2'
    | 'TRAINING_ADAPTIVE_V3'
    | 'TRAINING_PERSONALIZED_V4'
    | 'TRAINING_BARRIER_AWARE_V5';
  learningObjective?: string;
  businessScenario?: string;
  constraints?: readonly string[];
  successCriteria?: readonly string[];
  commonMistakes?: readonly string[];
  evaluationCriteria?: readonly string[];
  difficulty?: TrainingMissionDifficulty;
  difficultyReasonCode?: TrainingDifficultyReasonCode;
  difficultyGuidance?: string;
  qualityVersion?: typeof AI_TRAINING_MISSION_QUALITY_VERSION;
  catalogVersion?: typeof AI_TRAINING_MISSION_QUALITY_VERSION;
  personalizationVersion?: typeof AI_TRAINING_PERSONALIZATION_VERSION;
  personalizationStatus?: 'PERSONALIZED' | 'FIXED_FALLBACK';
  personalizationReason?: string;
  hint?: string;
  practiceMode?: TrainingPracticeMode;
  missionVariant?: TrainingMissionVariant;
  barrierReason?: TrainingBarrierReason;
  barrierGuidance?: string;
  goalReviewRecommended?: boolean;
  standardVariant?: AiTrainingStandardVariantSnapshot;
}

export interface AiTrainingParticipantAction {
  id: string;
  sequence: number;
  actionKey: TrainingActionKey;
  mode: 'WORK' | 'WAIT';
  status: 'PRESENTED' | 'STARTED';
  display: AiTrainingActionDisplaySnapshot;
  presentedAt: Date;
  reevaluateAt: Date | null;
  submission: {
    answerId: string;
    evaluationStatus: 'PENDING' | 'READY' | 'FAILED';
  } | null;
}

export interface AiTrainingParticipantState {
  enrollmentId: string;
  programName: string;
  enrollmentStatus: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  startsAt: Date;
  endsAt: Date | null;
  profile: {
    role: TrainingRole;
    aiLevel: TrainingAiLevel;
    aiUseCases: TrainingUseCaseKey[];
    workChallenges: TrainingChallengeKey[];
    preferredTopics: TrainingTopicKey[];
    dailyMinutes: 5 | 10 | 15;
    learningGoalKey: TrainingGoalKey;
    workContext?: TrainingWorkContext;
    workContextComplete?: boolean;
  } | null;
  goal: { title: string } | null;
  action: AiTrainingParticipantAction | null;
}

export interface AiTrainingRuntimeCandidate {
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  programTemplateVersionId: string;
  participantUserId: string;
  profileUpdatedAt: Date;
  profileId: string;
  settings: AiTrainingRuntimeSettings;
  profile: {
    role: TrainingRole;
    aiLevel: TrainingAiLevel;
    learningGoalKey: TrainingGoalKey | null;
    needsReview: boolean;
    recentSuccesses: number;
    recentFailures: number;
    streak: number;
    skillScores: Readonly<Record<string, number>>;
    workContext?: TrainingWorkContext;
  };
  currentPhase: 'FOUNDATION' | 'PRACTICE' | 'APPLICATION';
  completedMissionKeys: readonly string[];
  completedMissionCount: number;
  lastMissionKey: string | null;
  bottleneckKey: string | null;
  activityBaselineAt: Date;
  lastActionAt: Date | null;
  activeWaitUntil: Date | null;
  progressRevision: number | null;
  workUseCount?: number;
  missions: readonly TrainingMissionDefinition[];
}

export type AiTrainingRuntimeWriteResult = 'APPLIED' | 'ALREADY_APPLIED' | 'STALE' | 'NOT_FOUND';

export interface AiTrainingRuntimeRepository {
  findState(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    now: Date;
  }): Promise<AiTrainingParticipantState | null>;
  findCandidate(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    now: Date;
  }): Promise<AiTrainingRuntimeCandidate | null>;
  persistDecision(input: {
    candidate: AiTrainingRuntimeCandidate;
    decision: NextActionDecision;
    mission: TrainingMissionDefinition;
    displaySnapshot: AiTrainingActionDisplaySnapshot;
    evaluatedAt: Date;
  }): Promise<AiTrainingRuntimeWriteResult>;
}

export class TrainingRuntimeError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'CONFIGURATION_ERROR' | 'CONFLICT',
    message: string,
  ) {
    super(message);
  }
}

const reasonText: Record<string, string> = {
  AI_FOUNDATION_NOT_COMPLETED: 'AIの基本から始めると、後の課題を安心して進められるためです。',
  CHATGPT_FOUNDATION_NOT_COMPLETED: 'ChatGPTの基本操作を先に確認する段階だからです。',
  BEGINNER_PROMPT_FOUNDATION_REQUIRED: 'AI初心者向けに、分かりやすい指示の作り方から練習します。',
  PROMPT_CONDITIONS_REQUIRED: '希望する結果を得るために、条件の伝え方を身につける段階です。',
  PROMPT_FORMAT_REQUIRED: '仕事で使いやすい形に整える指定を練習する段階です。',
  LEARNING_GOAL_PRIORITY: '最初に選んだ「できるようになりたいこと」へ近づく実務課題です。',
  WORK_USAGE_CONFIRMED_NEXT_PRACTICE:
    'これまでにAIを実務で使った経験を踏まえ、次の実践課題へ進みます。',
  ROLE_SALES_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の営業実務課題へ進みます。',
  ROLE_OFFICE_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の事務実務課題へ進みます。',
  ROLE_MANAGER_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の管理職向け課題へ進みます。',
  ROLE_OTHER_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の実務課題へ進みます。',
  PREVIOUS_MISSION_REQUIRES_REVIEW:
    '直近の結果をもとに、前の課題で難しかった部分を短く復習します。',
  USER_ACTIVITY_PAUSED: '無理なく再開できる小さな課題から始めます。',
  TRAINING_REEVALUATION_PENDING: '次の判定時刻までは新しい課題を増やさず、待つ時間です。',
};

export type TrainingDifficultyReasonCode =
  | 'RECOVERY_OR_REVIEW_EASY'
  | 'FOUNDATION_EASY'
  | 'STABLE_HIGH_SCORE_CHALLENGE'
  | 'PRACTICE_STANDARD';

export type TrainingDifficultyDecision = {
  difficulty: TrainingMissionDifficulty;
  reasonCode: TrainingDifficultyReasonCode;
};

export function resolveTrainingMissionDifficulty(
  context: AiTrainingV1DecisionContext,
  decision: NextActionDecision,
  mission: TrainingMissionDefinition,
): TrainingDifficultyDecision {
  if (
    decision.actionKey === 'RECOVERY' ||
    decision.reasonCode === 'PREVIOUS_MISSION_REQUIRES_REVIEW'
  ) {
    return { difficulty: 'EASY', reasonCode: 'RECOVERY_OR_REVIEW_EASY' };
  }
  if (mission.quality.difficulty === 'EASY') {
    return { difficulty: 'EASY', reasonCode: 'FOUNDATION_EASY' };
  }
  const skillScores = mission.quality.skillKeys.map((key) => context.skillScores[key]);
  const hasStableHighScore =
    context.recentSuccesses >= 3 &&
    context.streak >= 3 &&
    skillScores.length > 0 &&
    skillScores.every((score) => typeof score === 'number' && score >= 80);
  return hasStableHighScore
    ? { difficulty: 'CHALLENGE', reasonCode: 'STABLE_HIGH_SCORE_CHALLENGE' }
    : { difficulty: 'STANDARD', reasonCode: 'PRACTICE_STANDARD' };
}

const difficultyGuidance: Record<TrainingMissionDifficulty, string> = {
  EASY: 'まずは1つずつ確認しながら進めます。すべてを一度で完璧にする必要はありません。',
  STANDARD: '実際の仕事でそのまま使える内容を目指して取り組みます。',
  CHALLENGE: 'これまでの力を使い、例外や確認方法まで含む実践的な回答に挑戦します。',
};

export function parseAiTrainingRuntimeSettings(value: unknown): AiTrainingRuntimeSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const settings = value as Record<string, unknown>;
  if (settings['moduleKey'] !== 'AI_TRAINING_V1') return null;
  const pauseAfterDays = settings['pauseAfterDays'] ?? 7;
  const routeKey = settings['routeKey'] ?? 'PERSONALIZED';
  if (
    !Number.isInteger(pauseAfterDays) ||
    (pauseAfterDays as number) < 1 ||
    typeof routeKey !== 'string' ||
    !/^[A-Z][A-Z0-9_]{0,79}$/.test(routeKey)
  ) {
    throw new TrainingRuntimeError('CONFIGURATION_ERROR', 'invalid AI training runtime settings');
  }
  return {
    moduleKey: 'AI_TRAINING_V1',
    pauseAfterDays: pauseAfterDays as number,
    routeKey,
  };
}

export function renderAiTrainingAction(
  decision: NextActionDecision,
  mission: TrainingMissionDefinition,
  difficultyDecision: TrainingDifficultyDecision,
): AiTrainingActionDisplaySnapshot {
  return {
    schemaVersion: 3,
    actionKey: mission.key,
    mode: decision.mode,
    reasonCode: decision.reasonCode,
    title: mission.title,
    reason: reasonText[decision.reasonCode] ?? '現在の進捗に合う課題として選ばれました。',
    task: mission.quality.task,
    instructions:
      decision.mode === 'WAIT'
        ? []
        : ['課題の内容を確認する', '自分の仕事を思い浮かべて回答を作る', '回答欄から提出する'],
    estimatedMinutes: mission.estimatedMinutes,
    renderer: 'TRAINING_ADAPTIVE_V3',
    learningObjective: mission.quality.learningObjective,
    businessScenario: mission.quality.businessScenario,
    constraints: mission.quality.constraints,
    successCriteria: mission.quality.successCriteria,
    commonMistakes: mission.quality.commonMistakes,
    evaluationCriteria: mission.quality.evaluationCriteria,
    difficulty: difficultyDecision.difficulty,
    difficultyReasonCode: difficultyDecision.reasonCode,
    difficultyGuidance: difficultyGuidance[difficultyDecision.difficulty],
    qualityVersion: AI_TRAINING_MISSION_QUALITY_VERSION,
  };
}

export async function renderPersonalizedAiTrainingAction(input: {
  decision: NextActionDecision;
  mission: TrainingMissionDefinition;
  difficultyDecision: TrainingDifficultyDecision;
  candidate: AiTrainingRuntimeCandidate;
  personalizer: TrainingMissionPersonalizer;
}): Promise<AiTrainingActionDisplaySnapshot> {
  const fixed = renderAiTrainingAction(input.decision, input.mission, input.difficultyDecision);
  const base: AiTrainingActionDisplaySnapshot = {
    ...fixed,
    schemaVersion: 5 as const,
    renderer: 'TRAINING_BARRIER_AWARE_V5' as const,
    catalogVersion: AI_TRAINING_MISSION_QUALITY_VERSION,
    personalizationVersion: AI_TRAINING_PERSONALIZATION_VERSION,
    practiceMode:
      input.candidate.currentPhase !== 'FOUNDATION' && (input.candidate.workUseCount ?? 0) > 0
        ? ('WORK' as const)
        : ('PRACTICE' as const),
    missionVariant: 'STANDARD' as const,
  };
  if (input.decision.mode === 'WAIT') {
    return { ...base, personalizationStatus: 'FIXED_FALLBACK' };
  }
  try {
    const personalized = await input.personalizer.personalize({
      mission: input.mission,
      role: input.candidate.profile.role,
      aiLevel: input.candidate.profile.aiLevel,
      learningGoalKey: input.candidate.profile.learningGoalKey,
      workContext: resolveTrainingWorkContext(
        input.candidate.profile.workContext,
        input.candidate.profile.role,
      ),
      workUseCount: input.candidate.workUseCount ?? 0,
    });
    return {
      ...base,
      businessScenario: personalized.scenario,
      task: personalized.task,
      hint: personalized.hint,
      reason: personalized.reason,
      personalizationReason: personalized.reason,
      personalizationVersion: personalized.version,
      personalizationStatus: 'PERSONALIZED',
    };
  } catch {
    return { ...base, personalizationStatus: 'FIXED_FALLBACK' };
  }
}

const captureStandardVariant = (
  display: AiTrainingActionDisplaySnapshot,
): AiTrainingStandardVariantSnapshot => ({
  title: display.title,
  task: display.task,
  instructions: [...display.instructions],
  estimatedMinutes: display.estimatedMinutes,
  constraints: [...(display.constraints ?? [])],
  successCriteria: [...(display.successCriteria ?? [])],
  evaluationCriteria: [...(display.evaluationCriteria ?? [])],
  difficulty: display.difficulty ?? 'STANDARD',
  difficultyGuidance: display.difficultyGuidance ?? difficultyGuidance.STANDARD,
});

export function applyTrainingBarrierAdjustment(
  display: AiTrainingActionDisplaySnapshot,
  barrierReason: TrainingBarrierReason,
): AiTrainingActionDisplaySnapshot {
  const adjustment = resolveTrainingBarrierAdjustment(barrierReason);
  const standardVariant = display.standardVariant ?? captureStandardVariant(display);
  const shared = {
    ...display,
    schemaVersion: 5 as const,
    renderer: 'TRAINING_BARRIER_AWARE_V5' as const,
    barrierReason,
    barrierGuidance: adjustment.guidance,
    goalReviewRecommended: adjustment.goalReviewRecommended,
    missionVariant: adjustment.missionVariant,
    standardVariant,
  };
  if (adjustment.missionVariant === 'STANDARD') {
    return {
      ...shared,
      title: standardVariant.title,
      task: standardVariant.task,
      instructions: [...standardVariant.instructions],
      estimatedMinutes: standardVariant.estimatedMinutes,
      constraints: [...standardVariant.constraints],
      successCriteria: [...standardVariant.successCriteria],
      evaluationCriteria: [...standardVariant.evaluationCriteria],
      difficulty: standardVariant.difficulty,
      difficultyGuidance: standardVariant.difficultyGuidance,
    };
  }
  const firstCriterion = standardVariant.successCriteria[0] ?? '課題の要点を1つ回答に含める';
  const firstEvaluation = standardVariant.evaluationCriteria[0] ?? firstCriterion;
  return {
    ...shared,
    title: `${standardVariant.title}（1分版）`,
    task: `「${firstCriterion}」を満たす短い回答を1つ作ってください。`,
    instructions: ['課題の要点を1つ確認する', '短い回答を1つ作る', '回答欄から提出する'],
    estimatedMinutes: 1,
    constraints: standardVariant.constraints.slice(0, 1),
    successCriteria: [firstCriterion],
    evaluationCriteria: [firstEvaluation],
    difficulty: adjustment.difficulty ?? standardVariant.difficulty,
    difficultyGuidance:
      adjustment.difficulty === 'EASY'
        ? difficultyGuidance.EASY
        : '1分で要点を1つ試します。短い回答で構いません。',
  };
}

export function restoreTrainingStandardVariant(
  display: AiTrainingActionDisplaySnapshot,
): AiTrainingActionDisplaySnapshot | null {
  if (!display.standardVariant) return null;
  const standard = display.standardVariant;
  return {
    ...display,
    schemaVersion: 5,
    renderer: 'TRAINING_BARRIER_AWARE_V5',
    title: standard.title,
    task: standard.task,
    instructions: [...standard.instructions],
    estimatedMinutes: standard.estimatedMinutes,
    constraints: [...standard.constraints],
    successCriteria: [...standard.successCriteria],
    evaluationCriteria: [...standard.evaluationCriteria],
    difficulty: standard.difficulty,
    difficultyGuidance: standard.difficultyGuidance,
    missionVariant: 'STANDARD',
    barrierGuidance: '通常版に戻しました。',
    goalReviewRecommended: false,
  };
}

export function parseAiTrainingActionDisplay(
  value: unknown,
): AiTrainingActionDisplaySnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const display = value as Record<string, unknown>;
  const actionKey = display['actionKey'];
  const quality = typeof actionKey === 'string' ? getAiTrainingMissionQuality(actionKey) : null;
  if (
    !quality ||
    ![1, 2, 3, 4, 5].includes(Number(display['schemaVersion'])) ||
    typeof actionKey !== 'string' ||
    !['WORK', 'WAIT'].includes(String(display['mode'])) ||
    typeof display['reasonCode'] !== 'string' ||
    typeof display['title'] !== 'string' ||
    typeof display['reason'] !== 'string' ||
    !(display['task'] === undefined || typeof display['task'] === 'string') ||
    !Array.isArray(display['instructions']) ||
    !display['instructions'].every((item) => typeof item === 'string') ||
    !(
      display['estimatedMinutes'] === null ||
      (typeof display['estimatedMinutes'] === 'number' && display['estimatedMinutes'] >= 0)
    ) ||
    ![
      'TRAINING_FIXED_V1',
      'TRAINING_PRACTICE_V2',
      'TRAINING_ADAPTIVE_V3',
      'TRAINING_PERSONALIZED_V4',
      'TRAINING_BARRIER_AWARE_V5',
    ].includes(String(display['renderer']))
  ) {
    return null;
  }
  return {
    ...(display as unknown as AiTrainingActionDisplaySnapshot),
    actionKey: actionKey as TrainingActionKey,
    task: typeof display['task'] === 'string' ? display['task'] : quality.task,
    learningObjective:
      typeof display['learningObjective'] === 'string'
        ? display['learningObjective']
        : quality.learningObjective,
    businessScenario:
      typeof display['businessScenario'] === 'string'
        ? display['businessScenario']
        : quality.businessScenario,
    constraints: stringArray(display['constraints']) ?? quality.constraints,
    successCriteria: stringArray(display['successCriteria']) ?? quality.successCriteria,
    commonMistakes: stringArray(display['commonMistakes']) ?? quality.commonMistakes,
    evaluationCriteria: stringArray(display['evaluationCriteria']) ?? quality.evaluationCriteria,
    difficulty: isDifficulty(display['difficulty']) ? display['difficulty'] : quality.difficulty,
    ...(isDifficultyReasonCode(display['difficultyReasonCode'])
      ? { difficultyReasonCode: display['difficultyReasonCode'] }
      : {}),
    difficultyGuidance:
      typeof display['difficultyGuidance'] === 'string'
        ? display['difficultyGuidance']
        : difficultyGuidance[
            isDifficulty(display['difficulty']) ? display['difficulty'] : quality.difficulty
          ],
    qualityVersion: AI_TRAINING_MISSION_QUALITY_VERSION,
    ...(isTrainingBarrierReason(display['barrierReason'])
      ? { barrierReason: display['barrierReason'] }
      : {}),
    ...(['STANDARD', 'SHORT'].includes(String(display['missionVariant']))
      ? { missionVariant: display['missionVariant'] as TrainingMissionVariant }
      : {}),
  };
}

const stringArray = (value: unknown): readonly string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;

const isDifficulty = (value: unknown): value is TrainingMissionDifficulty =>
  ['EASY', 'STANDARD', 'CHALLENGE'].includes(String(value));

const isDifficultyReasonCode = (value: unknown): value is TrainingDifficultyReasonCode =>
  [
    'RECOVERY_OR_REVIEW_EASY',
    'FOUNDATION_EASY',
    'STABLE_HIGH_SCORE_CHALLENGE',
    'PRACTICE_STANDARD',
  ].includes(String(value));

const contextFor = (
  candidate: AiTrainingRuntimeCandidate,
  now: Date,
): AiTrainingV1DecisionContext => ({
  now,
  role: candidate.profile.role,
  aiLevel: candidate.profile.aiLevel,
  learningGoalKey: candidate.profile.learningGoalKey,
  currentPhase: candidate.currentPhase,
  completedMissionKeys: candidate.completedMissionKeys,
  completedMissionCount: candidate.completedMissionCount,
  recentSuccesses: candidate.profile.recentSuccesses,
  recentFailures: candidate.profile.recentFailures,
  needsReview: candidate.profile.needsReview,
  lastMissionKey: candidate.lastMissionKey,
  streak: candidate.profile.streak,
  bottleneckKey: candidate.bottleneckKey,
  skillScores: candidate.profile.skillScores,
  activityBaselineAt: candidate.activityBaselineAt,
  lastActionAt: candidate.lastActionAt,
  pauseAfterDays: candidate.settings.pauseAfterDays,
  activeWaitUntil: candidate.activeWaitUntil,
  workUseCount: candidate.workUseCount ?? 0,
});

export class AiTrainingParticipantService {
  constructor(
    private readonly repository: AiTrainingRuntimeRepository,
    private readonly policy: NextActionPolicy<AiTrainingV1DecisionContext>,
    private readonly personalizer: TrainingMissionPersonalizer = new RuleBasedTrainingMissionPersonalizer(),
  ) {}

  async current(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    now: Date;
  }) {
    let state = await this.repository.findState(input);
    if (!state) throw new TrainingRuntimeError('NOT_FOUND', 'AI training enrollment not found');
    if (state.profile === null || state.profile.workContextComplete === false) return state;
    const waiting = state.action?.mode === 'WAIT' && state.action.reevaluateAt;
    if (state.action && (!waiting || waiting > input.now)) return state;
    const candidate = await this.repository.findCandidate(input);
    if (!candidate) return state;
    const context = contextFor(candidate, input.now);
    const decision = this.policy.evaluate(context);
    const mission = candidate.missions.find(({ key }) => key === decision.actionKey);
    if (!mission) {
      throw new TrainingRuntimeError(
        'CONFIGURATION_ERROR',
        'selected training mission is undefined',
      );
    }
    const result = await this.repository.persistDecision({
      candidate,
      decision,
      mission,
      displaySnapshot: await renderPersonalizedAiTrainingAction({
        decision,
        mission,
        difficultyDecision: resolveTrainingMissionDifficulty(context, decision, mission),
        candidate,
        personalizer: this.personalizer,
      }),
      evaluatedAt: input.now,
    });
    if (result === 'NOT_FOUND')
      throw new TrainingRuntimeError('NOT_FOUND', 'AI training not found');
    state = await this.repository.findState(input);
    if (!state) throw new TrainingRuntimeError('NOT_FOUND', 'AI training enrollment not found');
    return state;
  }
}
