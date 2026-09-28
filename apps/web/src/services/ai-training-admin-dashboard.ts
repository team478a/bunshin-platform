import {
  TRAINING_SKILL_KEYS,
  TRAINING_SKILL_LABELS,
  type TrainingSkillKey,
} from '@bunshin/capability-training';

type TrainingRole = 'SALES' | 'OFFICE' | 'MANAGER' | 'OTHER';
type TrainingAiLevel = 'BEGINNER' | 'INTERMEDIATE';

export type AiTrainingAdminParticipantInput = {
  enrollmentId: string;
  enrollmentStatus: 'INVITED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  programName: string;
  participantName: string;
  participantEmail: string | null;
  profile: {
    role: TrainingRole;
    aiLevel: TrainingAiLevel;
    currentTopic: string | null;
    needsReview: boolean;
    recentFailures: number;
  } | null;
  progress: {
    phaseKey: string;
    stateKey: string;
    bottleneckKey: string | null;
    completedMissionCount: number;
    lastActionAt: Date | null;
  } | null;
  assignment: {
    missionDefinitionKey: string;
    displaySnapshot: unknown;
  } | null;
  latestEvaluation: unknown;
  evaluationUpdatedAt: Date | null;
  profileUpdatedAt: Date | null;
  workResults: Array<'USED_AS_IS' | 'USED_WITH_EDITS' | 'NOT_USED_YET' | 'NOT_APPLICABLE'>;
  barrierReasons: string[];
};

export type AiTrainingAdminParticipant = {
  enrollmentId: string;
  programName: string;
  participantName: string;
  participantEmail: string | null;
  roleLabel: string;
  aiLevelLabel: string;
  completedMissionCount: number;
  currentTopic: string;
  currentMission: string;
  weakArea: string;
  lastActivityAt: Date | null;
  engagement: 'NOT_STARTED' | 'ACTIVE' | 'NEEDS_SUPPORT' | 'INACTIVE' | 'COMPLETED' | 'ENDED';
};

export type AiTrainingAdminDashboard = {
  participants: AiTrainingAdminParticipant[];
  totals: {
    participants: number;
    active: number;
    continuedWithinSevenDays: number;
    continuationPercent: number;
    needsSupport: number;
    completedMissions: number;
    workResultParticipants: number;
    workResultCount: number;
    usedAsIs: number;
    usedWithEdits: number;
    notUsedYet: number;
    notApplicable: number;
    barrierCount: number;
    shortMissionCount: number;
    goalReviewBarrierCount: number;
  };
};

const DAY_MS = 86_400_000;
const roleLabels: Record<TrainingRole, string> = {
  SALES: '営業',
  OFFICE: '事務',
  MANAGER: '管理職',
  OTHER: 'その他',
};
const aiLevelLabels: Record<TrainingAiLevel, string> = {
  BEGINNER: 'AI初心者',
  INTERMEDIATE: 'AI中級',
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function currentMissionTitle(input: AiTrainingAdminParticipantInput): string {
  const display = objectValue(input.assignment?.displaySnapshot);
  return typeof display?.['title'] === 'string'
    ? display['title']
    : (input.assignment?.missionDefinitionKey ?? '課題はまだありません');
}

function latestWeakArea(input: AiTrainingAdminParticipantInput): string {
  const evaluation = objectValue(input.latestEvaluation);
  const weaknesses = evaluation?.['weaknesses'];
  if (Array.isArray(weaknesses)) {
    const first = weaknesses.find(
      (item): item is string => typeof item === 'string' && item.length > 0,
    );
    if (first) return first;
  }
  if (input.profile?.needsReview || (input.profile?.recentFailures ?? 0) >= 2)
    return '基礎の復習が必要です';
  if (input.progress?.bottleneckKey) return input.progress.bottleneckKey;
  return 'まだ記録がありません';
}

function latestDate(values: Array<Date | null | undefined>): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    return !latest || value > latest ? value : latest;
  }, null);
}

function topicLabel(value: string | null | undefined): string | null {
  return value && TRAINING_SKILL_KEYS.includes(value as TrainingSkillKey)
    ? TRAINING_SKILL_LABELS[value as TrainingSkillKey]
    : (value ?? null);
}

export function buildAiTrainingAdminDashboard(
  input: readonly AiTrainingAdminParticipantInput[],
  now: Date,
): AiTrainingAdminDashboard {
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const participants = input.map<AiTrainingAdminParticipant>((item) => {
    const lastActivityAt = latestDate([
      item.progress?.lastActionAt,
      item.evaluationUpdatedAt,
      item.profileUpdatedAt,
    ]);
    const completedMissionCount = item.progress?.completedMissionCount ?? 0;
    const needsSupport =
      item.profile?.needsReview === true || (item.profile?.recentFailures ?? 0) >= 2;
    const engagement =
      item.enrollmentStatus === 'COMPLETED'
        ? 'COMPLETED'
        : ['CANCELLED', 'EXPIRED'].includes(item.enrollmentStatus)
          ? 'ENDED'
          : !item.profile || (!item.assignment && completedMissionCount === 0)
            ? 'NOT_STARTED'
            : needsSupport
              ? 'NEEDS_SUPPORT'
              : !lastActivityAt || lastActivityAt < sevenDaysAgo
                ? 'INACTIVE'
                : 'ACTIVE';
    return {
      enrollmentId: item.enrollmentId,
      programName: item.programName,
      participantName: item.participantName,
      participantEmail: item.participantEmail,
      roleLabel: item.profile ? roleLabels[item.profile.role] : '未設定',
      aiLevelLabel: item.profile ? aiLevelLabels[item.profile.aiLevel] : '未設定',
      completedMissionCount,
      currentTopic: topicLabel(item.profile?.currentTopic) ?? item.progress?.phaseKey ?? '未設定',
      currentMission: currentMissionTitle(item),
      weakArea: latestWeakArea(item),
      lastActivityAt,
      engagement,
    };
  });
  const activeParticipants = participants.filter(
    (item) =>
      input.find((source) => source.enrollmentId === item.enrollmentId)?.enrollmentStatus ===
      'ACTIVE',
  );
  const continuedWithinSevenDays = activeParticipants.filter(
    (item) => item.lastActivityAt && item.lastActivityAt >= sevenDaysAgo,
  ).length;
  return {
    participants: participants.sort((left, right) => {
      const priority = {
        NEEDS_SUPPORT: 0,
        INACTIVE: 1,
        NOT_STARTED: 2,
        ACTIVE: 3,
        COMPLETED: 4,
        ENDED: 5,
      };
      return (
        priority[left.engagement] - priority[right.engagement] ||
        left.participantName.localeCompare(right.participantName, 'ja')
      );
    }),
    totals: {
      participants: participants.length,
      active: activeParticipants.length,
      continuedWithinSevenDays,
      continuationPercent:
        activeParticipants.length === 0
          ? 0
          : Math.round((continuedWithinSevenDays / activeParticipants.length) * 100),
      needsSupport: participants.filter((item) =>
        ['NEEDS_SUPPORT', 'INACTIVE'].includes(item.engagement),
      ).length,
      completedMissions: participants.reduce((sum, item) => sum + item.completedMissionCount, 0),
      workResultParticipants: input.filter((item) => item.workResults.length > 0).length,
      workResultCount: input.reduce((sum, item) => sum + item.workResults.length, 0),
      usedAsIs: input.reduce(
        (sum, item) => sum + item.workResults.filter((value) => value === 'USED_AS_IS').length,
        0,
      ),
      usedWithEdits: input.reduce(
        (sum, item) => sum + item.workResults.filter((value) => value === 'USED_WITH_EDITS').length,
        0,
      ),
      notUsedYet: input.reduce(
        (sum, item) => sum + item.workResults.filter((value) => value === 'NOT_USED_YET').length,
        0,
      ),
      notApplicable: input.reduce(
        (sum, item) => sum + item.workResults.filter((value) => value === 'NOT_APPLICABLE').length,
        0,
      ),
      barrierCount: input.reduce((sum, item) => sum + item.barrierReasons.length, 0),
      shortMissionCount: input.reduce(
        (sum, item) =>
          sum +
          item.barrierReasons.filter((value) =>
            ['BUSY', 'TOO_DIFFICULT', 'DONT_KNOW_HOW'].includes(value),
          ).length,
        0,
      ),
      goalReviewBarrierCount: input.reduce(
        (sum, item) =>
          sum +
          item.barrierReasons.filter((value) => ['NOT_RELEVANT', 'LOW_VALUE'].includes(value))
            .length,
        0,
      ),
    },
  };
}
