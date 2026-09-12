const DAY_MS = 24 * 60 * 60 * 1000;
const FOUR_WEEKS_MS = 28 * DAY_MS;

export type RewardsPilotReadinessKey = 'POLICY' | 'PERIOD' | 'PARTICIPANTS' | 'ISSUANCE' | 'RULES';

export type RewardsPilotReadinessItem = {
  key: RewardsPilotReadinessKey;
  ready: boolean;
  label: string;
  detail: string;
};

export type RewardsPilotReadiness = {
  status: 'READY' | 'ACTION_REQUIRED' | 'COMPLETED';
  missingCount: number;
  items: RewardsPilotReadinessItem[];
};

export function buildRewardsPilotReadiness(input: {
  policyStatus: 'ENABLED' | 'DISABLED' | null;
  startsAt: Date | null;
  endsAt: Date | null;
  now: Date;
  activeParticipantCount: number;
  pointIssuanceStopped: boolean;
  activeRuleCount: number;
}): RewardsPilotReadiness {
  const hasValidPeriod = Boolean(
    input.startsAt &&
    input.endsAt &&
    input.endsAt > input.startsAt &&
    input.endsAt.getTime() - input.startsAt.getTime() >= FOUR_WEEKS_MS,
  );
  const completed = Boolean(hasValidPeriod && input.endsAt && input.endsAt <= input.now);
  const participantCountIsValid =
    input.activeParticipantCount >= 1 && input.activeParticipantCount <= 30;

  const items: RewardsPilotReadinessItem[] = [
    {
      key: 'POLICY',
      ready: input.policyStatus === 'ENABLED',
      label: 'サービスの利用許可',
      detail:
        input.policyStatus === 'ENABLED'
          ? 'ポイントとバッジの試験利用が許可されています。'
          : 'ポイントとバッジの試験利用を許可してください。',
    },
    {
      key: 'PERIOD',
      ready: hasValidPeriod,
      label: '4週間の試験期間',
      detail: hasValidPeriod
        ? '開始日から終了日まで、28日以上の期間が設定されています。'
        : '開始日と、開始日から28日以上後の終了日を設定してください。',
    },
    {
      key: 'PARTICIPANTS',
      ready: participantCountIsValid,
      label: '試験利用者',
      detail: participantCountIsValid
        ? `${input.activeParticipantCount}人が試験利用できます。`
        : input.activeParticipantCount > 30
          ? '試験利用者を30人以下にしてください。'
          : '試験利用者を1人以上選んでください。',
    },
    {
      key: 'ISSUANCE',
      ready: !input.pointIssuanceStopped,
      label: 'ポイント付与',
      detail: input.pointIssuanceStopped
        ? '一括停止中です。試験を始める前に再開してください。'
        : 'ポイントを付与できる状態です。',
    },
    {
      key: 'RULES',
      ready: input.activeRuleCount > 0,
      label: 'ポイントのため方',
      detail:
        input.activeRuleCount > 0
          ? `${input.activeRuleCount}種類の付与条件が利用できます。`
          : '利用する付与条件を1種類以上選んでください。',
    },
  ];
  const missingCount = items.filter((item) => !item.ready).length;

  return {
    status: completed ? 'COMPLETED' : missingCount === 0 ? 'READY' : 'ACTION_REQUIRED',
    missingCount,
    items,
  };
}
