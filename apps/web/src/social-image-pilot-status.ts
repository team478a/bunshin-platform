export const socialImagePilotApprovalChecks = [
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
  'FINAL_APPROVAL',
] as const;

type Evidence = {
  checkKey: (typeof socialImagePilotApprovalChecks)[number];
  action: 'RECORDED' | 'REVOKED';
};

type Pilot = {
  emergencyStop: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
} | null;

export function buildSocialImagePilotStatus(input: {
  pilot: Pilot;
  evidence: Evidence[];
  now: Date;
}) {
  const latest = new Map(input.evidence.map((item) => [item.checkKey, item.action]));
  const remainingChecks = socialImagePilotApprovalChecks.filter(
    (key) => latest.get(key) !== 'RECORDED',
  ).length;
  if (!input.pilot) return { state: 'NOT_CONFIGURED' as const, label: '未設定', remainingChecks };
  if (input.pilot.emergencyStop)
    return { state: 'EMERGENCY_STOPPED' as const, label: '緊急停止中', remainingChecks };
  if (remainingChecks > 0)
    return { state: 'PREPARING' as const, label: '開始準備中', remainingChecks };
  if (input.pilot.startsAt && input.pilot.startsAt > input.now)
    return { state: 'SCHEDULED' as const, label: '開始待ち', remainingChecks };
  if (input.pilot.endsAt && input.pilot.endsAt <= input.now)
    return { state: 'ENDED' as const, label: '終了', remainingChecks };
  return { state: 'ACTIVE' as const, label: '利用中', remainingChecks };
}
