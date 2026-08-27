import type {
  ActivityMotivation,
  MissionProgress,
  MissionProgressDayStatus,
} from '@bunshin/capability-social';

const DAY_MS = 86_400_000;

export type MissionProgressView = MissionProgress;
export type ActivityMotivationView = ActivityMotivation;

export function localDateInTimezone(now: Date, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function weekRange(localDate: string) {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const start = new Date(date.valueOf() - mondayOffset * DAY_MS);
  const end = new Date(start.valueOf() + 6 * DAY_MS);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}

export const progressStatusLabel: Record<MissionProgressDayStatus, string> = {
  UNSEEN: 'まだ見ていません',
  CONFIRMED: '確認しました',
  PREPARED: '投稿の準備をしました',
  POSTED: '投稿しました',
  RESTED: 'お休みしました',
};

export function weeklyCalendar(progress: MissionProgressView) {
  const start = new Date(`${progress.weekStart}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const missionDate = new Date(start.valueOf() + index * DAY_MS).toISOString().slice(0, 10);
    const activity = progress.weekly.days.find((day) => day.missionDate === missionDate);
    return {
      missionDate,
      dailyMissionId: activity?.dailyMissionId ?? null,
      status: activity?.status ?? ('UNSEEN' as const),
    };
  });
}
