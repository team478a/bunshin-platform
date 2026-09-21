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
}

export interface AiTrainingActionDisplaySnapshot {
  schemaVersion: 1;
  actionKey: TrainingActionKey;
  mode: 'WORK' | 'WAIT';
  reasonCode: string;
  title: string;
  reason: string;
  task: string;
  instructions: string[];
  estimatedMinutes: number | null;
  renderer: 'TRAINING_FIXED_V1';
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

const missionTasks: Record<TrainingActionKey, string> = {
  AI_BASIC: 'AIに任せたい仕事を1つ選び、「何をしてほしいか」を1文で書いてください。',
  CHATGPT_BASIC: 'ChatGPTへ実際に送りたい質問を、相手に話すような言葉で書いてください。',
  PROMPT_BASIC: '目的と依頼内容が伝わる指示を1つ作ってください。',
  PROMPT_CONDITION: '作った指示に、対象・長さ・注意点などの条件を2つ以上加えてください。',
  PROMPT_FORMAT: '表、箇条書き、メール文など、希望する出力形式を含む指示を書いてください。',
  PROMPT_REVIEW: '前回の指示を、目的・条件・出力形式が分かる形に書き直してください。',
  EMAIL_WRITING:
    '仕事で使うメールを1つ選び、相手・目的・伝える内容を含むAIへの指示を書いてください。',
  DOCUMENT_SUMMARY:
    '要約したい文章を想定し、残すべき情報と希望する長さをAIへ伝える指示を書いてください。',
  DOCUMENT_PROOFREAD: '直したい文章を想定し、読み手と希望する文体を含む校正指示を書いてください。',
  IDEA_GENERATION:
    '仕事上のテーマを1つ決め、条件を付けてアイデアを出してもらう指示を書いてください。',
  SALES_EMAIL: '見込み客へ送る営業メールを作るため、相手・商品・目的を含む指示を書いてください。',
  SALES_HEARING:
    '商談前に確認したいことを整理するため、顧客像を含むヒアリング項目作成の指示を書いてください。',
  SALES_PROPOSAL: '顧客の課題と提案内容を想定し、提案書の骨子を作る指示を書いてください。',
  SALES_FOLLOW_UP: '商談後の状況を想定し、押しつけないフォロー文を作る指示を書いてください。',
  OFFICE_MINUTES:
    '会議内容を想定し、決定事項と担当・期限が分かる議事録作成の指示を書いてください。',
  OFFICE_DOCUMENT: '作りたい社内文書を1つ選び、読み手・目的・必要項目を含む指示を書いてください。',
  OFFICE_EXCEL: 'Excelで困っている作業を1つ選び、列の内容と期待する結果を説明してください。',
  OFFICE_DATA: '整理したいデータを想定し、分類方法と完成形をAIへ伝える指示を書いてください。',
  MANAGER_PROCESS_REVIEW:
    'チームの業務を1つ選び、手順・担当・困りごとを洗い出すAIへの指示を書いてください。',
  MANAGER_IMPROVEMENT:
    '改善したい業務を1つ選び、制約条件を含めて改善案を求める指示を書いてください。',
  MANAGER_AI_DESIGN: 'AIを使いたい業務を1つ選び、人が確認する工程を含む活用手順を書いてください。',
  MANAGER_TEAM_GUIDANCE:
    '部下へAI活用を依頼する場面を想定し、目的・禁止事項・確認方法を含む指示を書いてください。',
  MANAGER_AI_RULES:
    '社内でAIを安全に使うため、入力禁止情報と確認事項を含むルール案を書いてください。',
  RECOVERY: '今の仕事でAIに手伝ってほしいことを、短い1文だけ書いてください。',
  WAIT: '今日は新しい課題はありません。次の判定時刻まで、そのままお待ちください。',
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
    schemaVersion: 1,
    actionKey: mission.key,
    mode: decision.mode,
    reasonCode: decision.reasonCode,
    title: mission.title,
    reason: reasonText[decision.reasonCode] ?? '現在の進捗に合う課題として選ばれました。',
    task: missionTasks[mission.key],
    instructions:
      decision.mode === 'WAIT'
        ? []
        : ['課題の内容を確認する', '自分の仕事を思い浮かべて回答を作る', '回答欄から提出する'],
    estimatedMinutes: mission.estimatedMinutes,
    renderer: 'TRAINING_FIXED_V1',
  };
}

export function parseAiTrainingActionDisplay(
  value: unknown,
): AiTrainingActionDisplaySnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const display = value as Record<string, unknown>;
  const actionKey = display['actionKey'];
  if (
    display['schemaVersion'] !== 1 ||
    typeof actionKey !== 'string' ||
    !(actionKey in missionTasks) ||
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
    display['renderer'] !== 'TRAINING_FIXED_V1'
  ) {
    return null;
  }
  return {
    ...(display as unknown as AiTrainingActionDisplaySnapshot),
    actionKey: actionKey as TrainingActionKey,
    task:
      typeof display['task'] === 'string'
        ? display['task']
        : missionTasks[actionKey as TrainingActionKey],
  };
}

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
