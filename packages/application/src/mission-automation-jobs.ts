import { ApplicationError } from '@bunshin/shared';
import type {
  CompleteJob,
  EnqueueJob,
  FailJob,
  Job,
  JobEnvironment,
  LineNotificationPreference,
} from './index';

export const MISSION_AUTOMATION_JOB_TYPES = [
  'WEEKLY_PLAN_PREPARE',
  'DAILY_MISSION_GENERATE',
  'TREND_RESEARCH_REFRESH',
] as const;
export type MissionAutomationJobType = (typeof MISSION_AUTOMATION_JOB_TYPES)[number];

export interface MissionAutomationScope {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
}

export interface MissionAutomationScopeRepository {
  validateWeekly(input: MissionAutomationScope & { weekStartDate: string }): Promise<boolean>;
  validateDaily(input: MissionAutomationScope & { missionDate: string }): Promise<boolean>;
  validateTrend(
    input: MissionAutomationScope & { socialProfileId: string; periodStart: string },
  ): Promise<boolean>;
}

export interface MissionAutomationCandidateRepository {
  listEnabled(limit: number): Promise<{
    candidates: LineNotificationPreference[];
    truncated: boolean;
  }>;
}

export interface MissionAutomationScheduleSummary {
  environment: JobEnvironment;
  candidates: number;
  due: number;
  weeklyEnqueued: number;
  dailyEnqueued: number;
  skipped: number;
  failures: number;
  truncated: boolean;
}

const localClock = (at: Date, timezone: string) => {
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
};

const nextLocalDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const isSuppressed = (
  preference: LineNotificationPreference,
  at: Date,
  local: ReturnType<typeof localClock>,
  includeFrequency = true,
) => {
  if (!preference.enabled || preference.notificationConsentAt === null) return true;
  if (preference.pausedUntil && preference.pausedUntil.getTime() > at.getTime()) return true;
  if (
    includeFrequency &&
    preference.frequency === 'WEEKDAYS' &&
    ['Sat', 'Sun'].includes(local.weekday)
  )
    return true;
  const { quietHoursStart: start, quietHoursEnd: end } = preference;
  return start < end
    ? local.time >= start && local.time < end
    : local.time >= start || local.time < end;
};

export class RunMissionAutomationScheduler {
  constructor(
    private readonly candidates: MissionAutomationCandidateRepository,
    private readonly weekly: ScheduleWeeklyPlanPreparation,
    private readonly daily: ScheduleDailyMissionGeneration,
    private readonly now = () => new Date(),
    private readonly limit = 1_000,
  ) {}

  async execute(environment: JobEnvironment): Promise<MissionAutomationScheduleSummary> {
    const at = this.now();
    const values = await this.candidates.listEnabled(this.limit);
    const summary: MissionAutomationScheduleSummary = {
      environment,
      candidates: values.candidates.length,
      due: 0,
      weeklyEnqueued: 0,
      dailyEnqueued: 0,
      skipped: 0,
      failures: 0,
      truncated: values.truncated,
    };
    for (const preference of values.candidates) {
      const local = localClock(at, preference.timezone);
      if (local.time !== preference.localTime) continue;
      summary.due += 1;
      const scope = {
        environment,
        workspaceId: preference.workspaceId,
        bunshinId: preference.bunshinId,
        actorUserId: preference.userId,
        correlationId: `scheduler:${environment}:${local.date}`,
      };
      if (local.weekday === 'Sun' && !isSuppressed(preference, at, local, false)) {
        try {
          await this.weekly.execute({ ...scope, weekStartDate: nextLocalDate(local.date) });
          summary.weeklyEnqueued += 1;
        } catch (error) {
          if (error instanceof ApplicationError && error.code === 'FORBIDDEN') summary.skipped += 1;
          else summary.failures += 1;
        }
      }
      if (isSuppressed(preference, at, local)) {
        summary.skipped += 1;
        continue;
      }
      try {
        await this.daily.execute({ ...scope, missionDate: local.date });
        summary.dailyEnqueued += 1;
      } catch (error) {
        if (error instanceof ApplicationError && error.code === 'FORBIDDEN') summary.skipped += 1;
        else summary.failures += 1;
      }
    }
    return summary;
  }
}

interface ScheduleInput extends MissionAutomationScope {
  environment: JobEnvironment;
  correlationId: string;
  scheduledAt?: Date;
}

const localDate = (value: string, monday = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid local date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value ||
    (monday && date.getUTCDay() !== 1)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid local date');
  return value;
};

export class ScheduleWeeklyPlanPreparation {
  constructor(
    private readonly jobs: EnqueueJob,
    private readonly scopes: MissionAutomationScopeRepository,
  ) {}
  async execute(input: ScheduleInput & { weekStartDate: string }) {
    const weekStartDate = localDate(input.weekStartDate, true);
    if (!(await this.scopes.validateWeekly({ ...input, weekStartDate })))
      throw new ApplicationError('FORBIDDEN', 'weekly automation is not eligible');
    return this.jobs.enqueue({
      environment: input.environment,
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL',
      correlationId: input.correlationId,
      requestedBy: input.actorUserId,
      jobType: 'WEEKLY_PLAN_PREPARE',
      payloadReference: `weekly-plan:${weekStartDate}`,
      idempotencyKey: `weekly-plan:${input.workspaceId}:${input.bunshinId}:${weekStartDate}`,
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    });
  }
}

export class ScheduleDailyMissionGeneration {
  constructor(
    private readonly jobs: EnqueueJob,
    private readonly scopes: MissionAutomationScopeRepository,
  ) {}
  async execute(input: ScheduleInput & { missionDate: string }) {
    const missionDate = localDate(input.missionDate);
    if (!(await this.scopes.validateDaily({ ...input, missionDate })))
      throw new ApplicationError('FORBIDDEN', 'daily automation is not eligible');
    return this.jobs.enqueue({
      environment: input.environment,
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL',
      correlationId: input.correlationId,
      requestedBy: input.actorUserId,
      jobType: 'DAILY_MISSION_GENERATE',
      payloadReference: `daily-mission:${missionDate}`,
      idempotencyKey: `daily-mission:${input.workspaceId}:${input.bunshinId}:${missionDate}`,
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    });
  }
}

export interface MissionAutomationHandler {
  execute(input: { job: Job; localDate: string }): Promise<void>;
}

export class MissionAutomationHandlerRegistry {
  private readonly handlers = new Map<MissionAutomationJobType, MissionAutomationHandler>();
  register(type: MissionAutomationJobType, handler: MissionAutomationHandler) {
    if (this.handlers.has(type))
      throw new ApplicationError('CONFLICT', 'job handler already registered');
    this.handlers.set(type, handler);
    return this;
  }
  get(type: string) {
    if (!MISSION_AUTOMATION_JOB_TYPES.includes(type as MissionAutomationJobType)) return null;
    return this.handlers.get(type as MissionAutomationJobType) ?? null;
  }
}

export class MissionAutomationHandlerError extends Error {
  constructor(
    readonly category: string,
    readonly retryable: boolean,
    message = category,
  ) {
    super(message);
  }
}

export class ExecuteMissionAutomationJob {
  constructor(
    private readonly scopes: MissionAutomationScopeRepository,
    private readonly registry: MissionAutomationHandlerRegistry,
    private readonly complete: CompleteJob,
    private readonly fail: FailJob,
  ) {}

  async execute(job: Job, workerId: string) {
    if (!job.bunshinId || job.capabilityType !== 'SOCIAL')
      return this.fail.execute(job, workerId, {
        errorCategory: 'INVALID_JOB_SCOPE',
        retryable: false,
      });
    const handler = this.registry.get(job.jobType);
    const reference = /^(weekly-plan|daily-mission):(\d{4}-\d{2}-\d{2})$/.exec(
      job.payloadReference,
    );
    const trendReference = /^trend-research:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(
      job.payloadReference,
    );
    if (!handler || (!reference && !trendReference))
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_JOB',
        retryable: false,
      });
    const date = localDate(
      (reference?.[2] ?? trendReference?.[2])!,
      job.jobType !== 'DAILY_MISSION_GENERATE',
    );
    const scope = {
      workspaceId: job.workspaceId,
      bunshinId: job.bunshinId,
      actorUserId: job.requestedBy,
    };
    const eligible =
      job.jobType === 'WEEKLY_PLAN_PREPARE'
        ? await this.scopes.validateWeekly({ ...scope, weekStartDate: date })
        : job.jobType === 'DAILY_MISSION_GENERATE'
          ? await this.scopes.validateDaily({ ...scope, missionDate: date })
          : await this.scopes.validateTrend({
              ...scope,
              socialProfileId: trendReference![1]!,
              periodStart: date,
            });
    if (!eligible)
      return this.fail.execute(job, workerId, {
        errorCategory: 'SCOPE_NO_LONGER_ELIGIBLE',
        retryable: false,
      });
    try {
      await handler.execute({ job, localDate: date });
      return this.complete.execute(job.id, workerId);
    } catch (error) {
      const classified =
        error instanceof MissionAutomationHandlerError
          ? error
          : new MissionAutomationHandlerError('HANDLER_UNEXPECTED', true);
      return this.fail.execute(job, workerId, {
        errorCategory: classified.category,
        retryable: classified.retryable,
      });
    }
  }
}
