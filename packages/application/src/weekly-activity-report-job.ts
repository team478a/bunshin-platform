import { ApplicationError } from '@bunshin/shared';
import type {
  CompleteJob,
  EnqueueJob,
  FailJob,
  Job,
  JobEnvironment,
  LineNotificationPreference,
  MissionAutomationCandidateRepository,
} from './index';

const DAY_MS = 86_400_000;

function validMonday(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid weekly report date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value ||
    date.getUTCDay() !== 1
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid weekly report date');
  return value;
}

function localClock(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value['year']}-${value['month']}-${value['day']}`,
    time: `${value['hour']}:${value['minute']}`,
    weekday: value['weekday'] ?? '',
  };
}

function isAllowed(preference: LineNotificationPreference, at: Date, time: string) {
  if (!preference.enabled || !preference.notificationConsentAt) return false;
  if (preference.pausedUntil && preference.pausedUntil > at) return false;
  const { quietHoursStart: start, quietHoursEnd: end } = preference;
  const quiet = start < end ? time >= start && time < end : time >= start || time < end;
  return !quiet;
}

export class ScheduleWeeklyActivityReportDelivery {
  constructor(private readonly jobs: EnqueueJob) {}

  execute(input: {
    environment: JobEnvironment;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    weekStart: string;
    correlationId: string;
  }) {
    const weekStart = validMonday(input.weekStart);
    return this.jobs.enqueue({
      environment: input.environment,
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL',
      correlationId: input.correlationId,
      requestedBy: input.actorUserId,
      jobType: 'WEEKLY_ACTIVITY_REPORT_DELIVER',
      payloadReference: `weekly-activity-report:${weekStart}`,
      idempotencyKey: `weekly-activity-report:${input.workspaceId}:${input.bunshinId}:${input.actorUserId}:${weekStart}`,
      priority: 120,
    });
  }
}

export interface WeeklyActivityReportScheduleSummary {
  candidates: number;
  due: number;
  enqueued: number;
  skipped: number;
  failures: number;
  truncated: boolean;
}

export class RunWeeklyActivityReportScheduler {
  constructor(
    private readonly candidates: MissionAutomationCandidateRepository,
    private readonly schedule: ScheduleWeeklyActivityReportDelivery,
    private readonly now = () => new Date(),
    private readonly limit = 1_000,
  ) {}

  async execute(environment: JobEnvironment): Promise<WeeklyActivityReportScheduleSummary> {
    const summary = {
      candidates: 0,
      due: 0,
      enqueued: 0,
      skipped: 0,
      failures: 0,
      truncated: false,
    };
    const at = this.now();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await this.candidates.listEnabled(this.limit, cursor);
      pages += 1;
      summary.candidates += page.candidates.length;
      for (const preference of page.candidates) {
        const local = localClock(at, preference.timezone);
        if (local.weekday !== 'Mon' || local.time !== preference.localTime) continue;
        summary.due += 1;
        if (!isAllowed(preference, at, local.time)) {
          summary.skipped += 1;
          continue;
        }
        const currentMonday = new Date(`${local.date}T00:00:00.000Z`);
        const weekStart = new Date(currentMonday.valueOf() - 7 * DAY_MS).toISOString().slice(0, 10);
        try {
          await this.schedule.execute({
            environment,
            workspaceId: preference.workspaceId,
            bunshinId: preference.bunshinId,
            actorUserId: preference.userId,
            weekStart,
            correlationId: `weekly-report-scheduler:${environment}:${local.date}`,
          });
          summary.enqueued += 1;
        } catch {
          summary.failures += 1;
        }
      }
      cursor = page.truncated ? page.nextCursor : undefined;
      summary.truncated = page.truncated && !cursor;
      if (!page.truncated) break;
    } while (cursor && pages < 100);
    if (cursor && pages >= 100) summary.truncated = true;
    return summary;
  }
}

export interface WeeklyActivityReportJobHandler {
  execute(input: {
    job: Job;
    weekStart: string;
  }): Promise<
    { status: 'SENT' } | { status: 'FAILED' | 'CANCELLED'; category: string; retryable: boolean }
  >;
}

export class ExecuteWeeklyActivityReportJob {
  constructor(
    private readonly handler: WeeklyActivityReportJobHandler,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    const match = /^weekly-activity-report:(\d{4}-\d{2}-\d{2})$/.exec(job.payloadReference);
    if (
      job.jobType !== 'WEEKLY_ACTIVITY_REPORT_DELIVER' ||
      !job.bunshinId ||
      job.capabilityType !== 'SOCIAL' ||
      !match
    )
      return this.fail.execute(job, workerId, {
        errorCategory: 'INVALID_WEEKLY_REPORT_JOB',
        retryable: false,
      });
    let weekStart: string;
    try {
      weekStart = validMonday(match[1]!);
    } catch {
      return this.fail.execute(job, workerId, {
        errorCategory: 'INVALID_WEEKLY_REPORT_JOB',
        retryable: false,
      });
    }
    try {
      const result = await this.handler.execute({ job, weekStart });
      if (result.status === 'SENT' || !result.retryable)
        return this.complete.execute(job.id, workerId);
      return this.fail.execute(job, workerId, {
        errorCategory: result.category,
        retryable: result.retryable,
      });
    } catch {
      return this.fail.execute(job, workerId, {
        errorCategory: 'WEEKLY_REPORT_UNEXPECTED',
        retryable: true,
      });
    }
  }
}
