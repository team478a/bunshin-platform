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
  schemaVersion: 1 | 2;
  actionKey: TrainingActionKey;
  mode: 'WORK' | 'WAIT';
  reasonCode: string;
  title: string;
  reason: string;
  task: string;
  instructions: string[];
  estimatedMinutes: number | null;
  renderer: 'TRAINING_FIXED_V1' | 'TRAINING_PRACTICE_V2';
  learningObjective?: string;
  businessScenario?: string;
  constraints?: readonly string[];
  successCriteria?: readonly string[];
  commonMistakes?: readonly string[];
  evaluationCriteria?: readonly string[];
  difficulty?: TrainingMissionDifficulty;
  qualityVersion?: typeof AI_TRAINING_MISSION_QUALITY_VERSION;
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
  settings: AiTrainingRuntimeSettings;
  profile: {
    role: TrainingRole;
    aiLevel: TrainingAiLevel;
    needsReview: boolean;
    recentSuccesses: number;
    recentFailures: number;
    streak: number;
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
  ROLE_SALES_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の営業実務課題へ進みます。',
  ROLE_OFFICE_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の事務実務課題へ進みます。',
  ROLE_MANAGER_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の管理職向け課題へ進みます。',
  ROLE_OTHER_NEXT_PRACTICE: '基礎とこれまでの進捗をもとに、次の実務課題へ進みます。',
  RECENT_FAILURES_REQUIRE_REVIEW: '直近の結果をもとに、苦手な部分を短く復習します。',
  USER_ACTIVITY_PAUSED: '無理なく再開できる小さな課題から始めます。',
  TRAINING_REEVALUATION_PENDING: '次の判定時刻までは新しい課題を増やさず、待つ時間です。',
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
): AiTrainingActionDisplaySnapshot {
  return {
    schemaVersion: 2,
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
    renderer: 'TRAINING_PRACTICE_V2',
    learningObjective: mission.quality.learningObjective,
    businessScenario: mission.quality.businessScenario,
    constraints: mission.quality.constraints,
    successCriteria: mission.quality.successCriteria,
    commonMistakes: mission.quality.commonMistakes,
    evaluationCriteria: mission.quality.evaluationCriteria,
    difficulty: mission.quality.difficulty,
    qualityVersion: AI_TRAINING_MISSION_QUALITY_VERSION,
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
    ![1, 2].includes(Number(display['schemaVersion'])) ||
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
    !['TRAINING_FIXED_V1', 'TRAINING_PRACTICE_V2'].includes(String(display['renderer']))
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
    qualityVersion: AI_TRAINING_MISSION_QUALITY_VERSION,
  };
}

const stringArray = (value: unknown): readonly string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;

const isDifficulty = (value: unknown): value is TrainingMissionDifficulty =>
  ['EASY', 'STANDARD', 'CHALLENGE'].includes(String(value));

const contextFor = (
  candidate: AiTrainingRuntimeCandidate,
  now: Date,
): AiTrainingV1DecisionContext => ({
  now,
  role: candidate.profile.role,
  aiLevel: candidate.profile.aiLevel,
  currentPhase: candidate.currentPhase,
  completedMissionKeys: candidate.completedMissionKeys,
  completedMissionCount: candidate.completedMissionCount,
  recentSuccesses: candidate.profile.recentSuccesses,
  recentFailures: candidate.profile.recentFailures,
  needsReview: candidate.profile.needsReview,
  lastMissionKey: candidate.lastMissionKey,
  streak: candidate.profile.streak,
  bottleneckKey: candidate.bottleneckKey,
  activityBaselineAt: candidate.activityBaselineAt,
  lastActionAt: candidate.lastActionAt,
  pauseAfterDays: candidate.settings.pauseAfterDays,
  activeWaitUntil: candidate.activeWaitUntil,
});

export class AiTrainingParticipantService {
  constructor(
    private readonly repository: AiTrainingRuntimeRepository,
    private readonly policy: NextActionPolicy<AiTrainingV1DecisionContext>,
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
    if (state.profile === null) return state;
    const waiting = state.action?.mode === 'WAIT' && state.action.reevaluateAt;
    if (state.action && (!waiting || waiting > input.now)) return state;
    const candidate = await this.repository.findCandidate(input);
    if (!candidate) return state;
    const decision = this.policy.evaluate(contextFor(candidate, input.now));
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
      displaySnapshot: renderAiTrainingAction(decision, mission),
      evaluatedAt: input.now,
    });
    if (result === 'NOT_FOUND')
      throw new TrainingRuntimeError('NOT_FOUND', 'AI training not found');
    state = await this.repository.findState(input);
    if (!state) throw new TrainingRuntimeError('NOT_FOUND', 'AI training enrollment not found');
    return state;
  }
}
