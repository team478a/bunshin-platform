export const WEEKLY_COPY_ACTIVITY_TYPES = [
  'COPIED_TEXT',
  'COPIED_SLIDE',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SCRIPT',
] as const;

export type WeeklyProgressMetrics = {
  missions: number;
  viewed: number;
  confirmed: number;
  copied: number;
  posted: number;
  rested: number;
  materials: number;
  variantsUsed: number;
  pointsEarned: number;
  pointsUsed: number;
  badges: string[];
};

export type WeeklyProgressSummary = WeeklyProgressMetrics & {
  completedActions: number;
  needsSupport: boolean;
  supportReason: string | null;
  headline: string;
  nextStep: string;
};

const emptyMetrics = (): WeeklyProgressMetrics => ({
  missions: 0,
  viewed: 0,
  confirmed: 0,
  copied: 0,
  posted: 0,
  rested: 0,
  materials: 0,
  variantsUsed: 0,
  pointsEarned: 0,
  pointsUsed: 0,
  badges: [],
});

export function buildWeeklyProgressSummary(
  input: Partial<WeeklyProgressMetrics>,
): WeeklyProgressSummary {
  const metrics = { ...emptyMetrics(), ...input };
  const completedActions =
    metrics.confirmed + metrics.copied + metrics.posted + metrics.rested + metrics.materials;
  const supportReason =
    metrics.missions > 0 && metrics.viewed === 0
      ? '今週の投稿案がまだ開かれていません'
      : metrics.viewed > 0 &&
          metrics.confirmed === 0 &&
          metrics.copied === 0 &&
          metrics.rested === 0
        ? '投稿案を見たあと、次の操作で止まっています'
        : metrics.copied >= 2 && metrics.posted === 0
          ? '投稿文をコピーしたあと、投稿完了の記録がありません'
          : null;
  const headline =
    metrics.posted > 0
      ? `今週は${metrics.posted}件、投稿できました`
      : completedActions > 0
        ? `今週は${completedActions}回、前に進みました`
        : metrics.missions > 0
          ? '今週の投稿案が用意されています'
          : 'できたことを一つ残すところから始めましょう';
  const nextStep =
    metrics.posted > 0
      ? '今日の写真や、お客様から聞かれたことを一つ残す'
      : metrics.copied > 0
        ? 'コピーした文章で投稿し、「投稿できた」を押す'
        : metrics.confirmed > 0
          ? '確認した投稿案の文章をコピーする'
          : metrics.materials > 0
            ? '残した素材を使って、今日の投稿案を見る'
            : metrics.missions > 0
              ? '今日の投稿案を開いて、内容を確認する'
              : 'Daily Actionに、今日あったことを一つ残す';
  return {
    ...metrics,
    badges: [...new Set(metrics.badges)],
    completedActions,
    needsSupport: supportReason !== null,
    supportReason,
    headline,
    nextStep,
  };
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function currentMonday(now: Date, timezone = 'Asia/Tokyo') {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return isoDate(date);
}

export function resolveWeeklyReportWindow(
  requestedWeek: string | undefined,
  now = new Date(),
  timezone = 'Asia/Tokyo',
) {
  const current = currentMonday(now, timezone);
  const minimum = new Date(`${current}T00:00:00.000Z`);
  minimum.setUTCDate(minimum.getUTCDate() - 11 * 7);
  const candidate = requestedWeek ?? current;
  const candidateDate = new Date(`${candidate}T00:00:00.000Z`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(candidate) &&
    !Number.isNaN(candidateDate.valueOf()) &&
    isoDate(candidateDate) === candidate &&
    candidateDate.getUTCDay() === 1 &&
    candidate >= isoDate(minimum) &&
    candidate <= current;
  const weekStart = valid ? candidate : current;
  const next = new Date(`${weekStart}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const weekEndDate = new Date(next);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() - 1);
  return {
    weekStart,
    weekEnd: isoDate(weekEndDate),
    startAt: new Date(`${weekStart}T00:00:00+09:00`),
    endAt: new Date(`${isoDate(next)}T00:00:00+09:00`),
    isCurrent: weekStart === current,
  };
}

export function previousWeek(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return isoDate(date);
}

export function nextWeek(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return isoDate(date);
}
