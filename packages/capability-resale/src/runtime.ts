import type {
  NextActionDecision,
  NextActionPolicy,
  ProgramSupportMode,
} from '@bunshin/application';
import type {
  AiResaleV1DecisionContext,
  DaySevenClassification,
  ResaleActionKey,
  ResaleItemSnapshot,
  ResaleProgramPolicyKey,
  ResaleProgramState,
} from './index';

export const AI_RESALE_V1_MODULE_KEY = 'AI_RESALE_V1';

export interface AiResaleRuntimeSettings {
  moduleKey: typeof AI_RESALE_V1_MODULE_KEY;
  policyKey: ResaleProgramPolicyKey;
  automaticEnrollment: boolean;
  supportMode: ProgramSupportMode;
  timeZone: string;
  pauseAfterDays: number;
  defaultWaitHours: number;
  routeKey: string;
  phaseKey: string;
}

export interface AiResaleRuntimeCandidate {
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  programTemplateVersionId: string;
  participantUserId: string;
  startsAt: Date;
  programDay: number;
  settings: AiResaleRuntimeSettings;
  programState: ResaleProgramState;
  activityBaselineAt: Date;
  lastUserActionAt: Date | null;
  completedMissionCount: number;
  progressRevision: number | null;
  daySevenClassified: boolean;
  items: readonly ResaleItemSnapshot[];
  eventTypes: readonly string[];
}

export interface AiResaleActionDisplaySnapshot {
  schemaVersion: 1;
  actionKey: ResaleActionKey;
  mode: NextActionDecision['mode'];
  reasonCode: string;
  title: string;
  reason: string;
  steps: string[];
  estimatedMinutes: number | null;
  target: NextActionDecision['target'];
  renderer: 'FIXED_FALLBACK';
}

export type AiResaleRuntimeWriteResult = 'APPLIED' | 'ALREADY_APPLIED' | 'STALE' | 'NOT_FOUND';

export interface AiResaleRuntimeRepository {
  enrollEligibleFreeParticipants(input: { now: Date; limit: number }): Promise<{
    scanned: number;
    enrolled: number;
    skipped: number;
    failures: number;
    truncated: boolean;
  }>;
  listDueCandidates(input: {
    now: Date;
    limit: number;
  }): Promise<{ candidates: AiResaleRuntimeCandidate[]; truncated: boolean }>;
  persistDecision(input: {
    candidate: AiResaleRuntimeCandidate;
    decision: NextActionDecision;
    displaySnapshot: AiResaleActionDisplaySnapshot;
    evaluatedAt: Date;
  }): Promise<AiResaleRuntimeWriteResult>;
  persistDaySevenClassification(input: {
    candidate: AiResaleRuntimeCandidate;
    classification: DaySevenClassification;
    evaluatedAt: Date;
  }): Promise<AiResaleRuntimeWriteResult>;
}

export interface AiResaleRuntimeBatchSummary {
  enrollment: {
    scanned: number;
    enrolled: number;
    skipped: number;
    failures: number;
    truncated: boolean;
  };
  candidates: number;
  actions: number;
  waits: number;
  daySevenClassified: number;
  alreadyApplied: number;
  stale: number;
  skipped: number;
  failures: number;
  truncated: boolean;
}

const keyPattern = /^[A-Z][A-Z0-9_]{0,79}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function positiveNumber(value: unknown, integer: boolean) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    (!integer || Number.isInteger(value))
  );
}

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export class AiResaleRuntimeConfigurationError extends Error {}

export function parseAiResaleRuntimeSettings(value: unknown): AiResaleRuntimeSettings | null {
  if (!object(value) || value['moduleKey'] !== AI_RESALE_V1_MODULE_KEY) return null;
  const policyKey = value['policyKey'];
  const supportMode = value['supportMode'];
  const timeZone = value['timeZone'];
  const routeKey = value['routeKey'];
  const phaseKey = value['phaseKey'];
  if (
    !['FREE_7D', 'PAID_90D'].includes(String(policyKey)) ||
    typeof value['automaticEnrollment'] !== 'boolean' ||
    !['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'].includes(String(supportMode)) ||
    typeof timeZone !== 'string' ||
    !validTimeZone(timeZone) ||
    !positiveNumber(value['pauseAfterDays'], true) ||
    !positiveNumber(value['defaultWaitHours'], false) ||
    typeof routeKey !== 'string' ||
    !keyPattern.test(routeKey) ||
    typeof phaseKey !== 'string' ||
    !keyPattern.test(phaseKey)
  ) {
    throw new AiResaleRuntimeConfigurationError('invalid AI resale runtime settings');
  }
  if (policyKey === 'PAID_90D' && value['automaticEnrollment']) {
    throw new AiResaleRuntimeConfigurationError('paid enrollment cannot be automatic');
  }
  return {
    moduleKey: AI_RESALE_V1_MODULE_KEY,
    policyKey: policyKey as ResaleProgramPolicyKey,
    automaticEnrollment: value['automaticEnrollment'],
    supportMode: supportMode as ProgramSupportMode,
    timeZone,
    pauseAfterDays: value['pauseAfterDays'] as number,
    defaultWaitHours: value['defaultWaitHours'] as number,
    routeKey,
    phaseKey,
  };
}

const fallbackCopy: Readonly<
  Record<
    ResaleActionKey,
    { title: string; reason: string; steps: string[]; minutes: number | null }
  >
> = {
  ITEM_FIND: {
    title: '家にある不要品を1つ探しましょう',
    reason: '最初の商品候補を決めると、次の作業へ進めます。',
    steps: ['家の中を1か所だけ見る', '売れそうな物を1つ選ぶ'],
    minutes: 5,
  },
  PHOTO: {
    title: '商品の写真を撮りましょう',
    reason: '出品に使う写真を先に用意します。',
    steps: ['明るい場所へ商品を置く', '正面と気になる部分を撮る'],
    minutes: 10,
  },
  LIST: {
    title: '商品を1つ出品しましょう',
    reason: '写真が準備できたので、販売を始められます。',
    steps: ['出品画面を開く', '写真と説明を確認して公開する'],
    minutes: 15,
  },
  WAIT: {
    title: '今日は何もしなくてOKです',
    reason: '出品直後のため、もう少し反応を待ちます。',
    steps: [],
    minutes: null,
  },
  CHECK: {
    title: '出品した商品の反応を確認しましょう',
    reason: '次に改善する必要があるかを判断します。',
    steps: ['出品中の商品を開く', '閲覧や反応の有無を記録する'],
    minutes: 5,
  },
  IMPROVE: {
    title: '出品内容を1か所だけ改善しましょう',
    reason: '反応が弱いため、小さな変更を1つ試します。',
    steps: ['写真・タイトル・価格から1つ選ぶ', '選んだ項目だけ変更する'],
    minutes: 10,
  },
  SHIPPING: {
    title: '売れた商品を発送しましょう',
    reason: '購入者へ安全に商品を届ける段階です。',
    steps: ['商品を梱包する', '発送して完了を記録する'],
    minutes: 15,
  },
  NEXT_ITEM: {
    title: '次の商品を1つ探しましょう',
    reason: '前の商品が完了したので、次の販売へ進めます。',
    steps: ['家の中を1か所だけ見る', '次に出す物を1つ選ぶ'],
    minutes: 5,
  },
  RECOVERY: {
    title: '小さな作業から再開しましょう',
    reason: '止まっていても問題ありません。短い作業から戻れます。',
    steps: ['家にある不要品を1つ見る'],
    minutes: 2,
  },
};

export function renderAiResaleFallback(
  decision: NextActionDecision,
): AiResaleActionDisplaySnapshot {
  const actionKey = decision.actionKey as ResaleActionKey;
  const copy = fallbackCopy[actionKey];
  if (!copy) throw new Error('unsupported AI resale action');
  return {
    schemaVersion: 1,
    actionKey,
    mode: decision.mode,
    reasonCode: decision.reasonCode,
    title: copy.title,
    reason: copy.reason,
    steps: [...copy.steps],
    estimatedMinutes: copy.minutes,
    target: decision.target,
    renderer: 'FIXED_FALLBACK',
  };
}

export function isDaySevenClassificationDue(candidate: AiResaleRuntimeCandidate) {
  return (
    candidate.settings.policyKey === 'FREE_7D' &&
    candidate.programDay > 7 &&
    !candidate.daySevenClassified
  );
}

function decisionContext(
  candidate: AiResaleRuntimeCandidate,
  now: Date,
): AiResaleV1DecisionContext {
  return {
    now,
    policyKey: candidate.settings.policyKey,
    programDay: candidate.programDay,
    programState: candidate.programState,
    activityBaselineAt: candidate.activityBaselineAt,
    lastUserActionAt: candidate.lastUserActionAt,
    pauseAfterDays: candidate.settings.pauseAfterDays,
    defaultWaitHours: candidate.settings.defaultWaitHours,
    items: candidate.items,
  };
}

export class RunAiResaleRuntimeBatch {
  constructor(
    private readonly repository: AiResaleRuntimeRepository,
    private readonly policy: NextActionPolicy<AiResaleV1DecisionContext>,
    private readonly now = () => new Date(),
    private readonly limit = 50,
  ) {}

  async execute(): Promise<AiResaleRuntimeBatchSummary> {
    const now = this.now();
    const enrollment = await this.repository.enrollEligibleFreeParticipants({
      now,
      limit: this.limit,
    });
    const due = await this.repository.listDueCandidates({ now, limit: this.limit });
    const summary: AiResaleRuntimeBatchSummary = {
      enrollment,
      candidates: due.candidates.length,
      actions: 0,
      waits: 0,
      daySevenClassified: 0,
      alreadyApplied: 0,
      stale: 0,
      skipped: 0,
      failures: enrollment.failures,
      truncated: enrollment.truncated || due.truncated,
    };
    for (const candidate of due.candidates) {
      try {
        const classificationDue = isDaySevenClassificationDue(candidate);
        let decisionMode: NextActionDecision['mode'] | null = null;
        let result: AiResaleRuntimeWriteResult;
        if (classificationDue) {
          result = await this.repository.persistDaySevenClassification({
            candidate,
            classification:
              candidate.items.some((item) => item.listedAt !== null) ||
              candidate.eventTypes.includes('FIRST_LISTING')
                ? 'LISTED'
                : candidate.eventTypes.some((eventType) =>
                      [
                        'ACTION_STARTED',
                        'ACTION_COMPLETED',
                        'ACTION_PARTIAL',
                        'ACTION_NOT_COMPLETED',
                        'HELP_REQUESTED',
                      ].includes(eventType),
                    )
                  ? 'PARTIAL'
                  : 'NOT_STARTED',
            evaluatedAt: now,
          });
        } else {
          const decision = this.policy.evaluate(decisionContext(candidate, now));
          decisionMode = decision.mode;
          result = await this.repository.persistDecision({
            candidate,
            decision,
            displaySnapshot: renderAiResaleFallback(decision),
            evaluatedAt: now,
          });
        }
        if (result === 'APPLIED') {
          if (classificationDue) summary.daySevenClassified += 1;
          else {
            if (decisionMode === 'WAIT') summary.waits += 1;
            else summary.actions += 1;
          }
        } else if (result === 'ALREADY_APPLIED') summary.alreadyApplied += 1;
        else if (result === 'STALE') summary.stale += 1;
        else summary.skipped += 1;
      } catch {
        summary.failures += 1;
      }
    }
    return summary;
  }
}
