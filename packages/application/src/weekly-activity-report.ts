import { ApplicationError } from '@bunshin/shared';

export interface WeeklyActivityReportScope {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  groupId?: string;
}

export interface WeeklyActivityReportSource {
  activities: Array<{
    dailyMissionId: string;
    type:
      | 'VIEWED'
      | 'ACCEPTED'
      | 'REJECTED'
      | 'CONFIRMED'
      | 'RESTED'
      | 'COPIED_TEXT'
      | 'COPIED_IMAGE_INSTRUCTION'
      | 'COPIED_VIDEO_PROMPT'
      | 'COPIED_SLIDE'
      | 'COPIED_SCRIPT'
      | 'POSTED'
      | 'FEEDBACK_GOOD'
      | 'FEEDBACK_NEUTRAL'
      | 'FEEDBACK_BAD';
    occurredAt: Date;
  }>;
  posts: Array<{ dailyMissionId: string; postedAt: Date }>;
  dailyActions: Array<{ id: string; createdAt: Date }>;
  variantSelections: Array<{ dailyMissionId: string; selectedAt: Date }>;
}

export interface WeeklyActivityReportRepository {
  read(
    input: WeeklyActivityReportScope & {
      from: Date;
      to: Date;
    },
  ): Promise<WeeklyActivityReportSource | null>;
}

export interface WeeklyActivityReport {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  confirmed: number;
  copied: number;
  posted: number;
  rested: number;
  materialsAdded: number;
  variantsUsed: number;
  totalActions: number;
  message: string;
}

const DAY_MS = 86_400_000;
const COPY_TYPES = new Set([
  'COPIED_TEXT',
  'COPIED_IMAGE_INSTRUCTION',
  'COPIED_VIDEO_PROMPT',
  'COPIED_SLIDE',
  'COPIED_SCRIPT',
]);

function date(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return parsed;
}

function localDate(value: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid timezone');
  }
}

function inWeek(value: Date, timezone: string, weekStart: string, weekEnd: string) {
  const day = localDate(value, timezone);
  return day >= weekStart && day <= weekEnd;
}

export function weeklyActivityReportMessage(report: Omit<WeeklyActivityReport, 'message'>) {
  if (report.posted > 0)
    return `${report.posted}件の投稿が完了しました。来週も無理のないペースで続けましょう。`;
  if (report.copied > 0 || report.confirmed > 0)
    return '投稿の準備が進んでいます。次は1件だけ投稿してみましょう。';
  if (report.materialsAdded > 0 || report.variantsUsed > 0)
    return '投稿に使える材料が増えました。次の提案に反映します。';
  if (report.rested > 0) return '休んだことも記録できています。来週できることから再開しましょう。';
  return '今週の記録はまだありません。まずは今日の提案を確認してみましょう。';
}

export class GetWeeklyActivityReport {
  constructor(private readonly repository: WeeklyActivityReportRepository) {}

  async execute(
    input: WeeklyActivityReportScope & {
      weekStart: string;
      timezone: string;
    },
  ): Promise<WeeklyActivityReport> {
    const start = date(input.weekStart, 'weekStart');
    if (start.getUTCDay() !== 1)
      throw new ApplicationError('VALIDATION_ERROR', 'weekStart must be Monday');
    localDate(new Date(), input.timezone);
    const weekEnd = new Date(start.valueOf() + 6 * DAY_MS).toISOString().slice(0, 10);
    // Read one extra UTC day on either side, then filter with the member timezone.
    const source = await this.repository.read({
      ...input,
      from: new Date(start.valueOf() - DAY_MS),
      to: new Date(start.valueOf() + 8 * DAY_MS),
    });
    if (!source) throw new ApplicationError('NOT_FOUND', 'weekly report unavailable');
    const activity = (type: string) =>
      new Set(
        source.activities
          .filter(
            (item) =>
              item.type === type &&
              inWeek(item.occurredAt, input.timezone, input.weekStart, weekEnd),
          )
          .map((item) => item.dailyMissionId),
      ).size;
    const copied = new Set(
      source.activities
        .filter(
          (item) =>
            COPY_TYPES.has(item.type) &&
            inWeek(item.occurredAt, input.timezone, input.weekStart, weekEnd),
        )
        .map((item) => item.dailyMissionId),
    ).size;
    const posted = new Set(
      source.posts
        .filter((item) => inWeek(item.postedAt, input.timezone, input.weekStart, weekEnd))
        .map((item) => item.dailyMissionId),
    ).size;
    const materialsAdded = source.dailyActions.filter((item) =>
      inWeek(item.createdAt, input.timezone, input.weekStart, weekEnd),
    ).length;
    const variantsUsed = new Set(
      source.variantSelections
        .filter((item) => inWeek(item.selectedAt, input.timezone, input.weekStart, weekEnd))
        .map((item) => item.dailyMissionId),
    ).size;
    const counts = {
      confirmed: activity('CONFIRMED'),
      copied,
      posted,
      rested: activity('RESTED'),
      materialsAdded,
      variantsUsed,
    };
    const result = {
      weekStart: input.weekStart,
      weekEnd,
      timezone: input.timezone,
      ...counts,
      totalActions: Object.values(counts).reduce((sum, value) => sum + value, 0),
    };
    return { ...result, message: weeklyActivityReportMessage(result) };
  }
}

export function weeklyActivityLineText(report: WeeklyActivityReport, deepLink: string) {
  let url: URL;
  try {
    url = new URL(deepLink);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid weekly report deep link');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid weekly report deep link');
  return [
    '今週の活動レポートです。',
    `確認：${report.confirmed}件`,
    `コピー：${report.copied}件`,
    `投稿完了：${report.posted}件`,
    `お休み：${report.rested}件`,
    `素材追加：${report.materialsAdded}件`,
    `別案利用：${report.variantsUsed}件`,
    '',
    report.message,
    '',
    'くわしく見る',
    url.toString(),
  ].join('\n');
}
