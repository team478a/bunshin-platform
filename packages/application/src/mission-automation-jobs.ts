import { ApplicationError } from '@bunshin/shared';
import type { CompleteJob, EnqueueJob, FailJob, Job, JobEnvironment } from './index';

export const MISSION_AUTOMATION_JOB_TYPES = [
  'WEEKLY_PLAN_PREPARE',
  'DAILY_MISSION_GENERATE',
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
    if (!handler || !reference)
      return this.fail.execute(job, workerId, {
        errorCategory: 'UNSUPPORTED_JOB',
        retryable: false,
      });
    const date = localDate(reference[2]!, job.jobType === 'WEEKLY_PLAN_PREPARE');
    const scope = {
      workspaceId: job.workspaceId,
      bunshinId: job.bunshinId,
      actorUserId: job.requestedBy,
    };
    const eligible =
      job.jobType === 'WEEKLY_PLAN_PREPARE'
        ? await this.scopes.validateWeekly({ ...scope, weekStartDate: date })
        : await this.scopes.validateDaily({ ...scope, missionDate: date });
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
