const DAY_MS = 86_400_000;
export const REWARDS_PILOT_EXPIRY_WARNING_DAYS = 7;

export type RewardsPilotExpiryNotice = {
  endsAt: Date;
  daysRemaining: number;
  endLabel: string;
};

export function getRewardsPilotExpiryNotice(
  endsAt: Date | null,
  now = new Date(),
): RewardsPilotExpiryNotice | null {
  if (!endsAt) return null;
  const remainingMs = endsAt.getTime() - now.getTime();
  if (remainingMs <= 0 || remainingMs > REWARDS_PILOT_EXPIRY_WARNING_DAYS * DAY_MS) return null;
  return {
    endsAt,
    daysRemaining: Math.ceil(remainingMs / DAY_MS),
    endLabel: new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(endsAt),
  };
}
