import type { CapabilityType } from '@bunshin/capability-contract';
import { ApplicationError } from '@bunshin/shared';

export interface JobContext {
  workspaceId: string;
  bunshinId?: string;
  capabilityType?: CapabilityType;
  correlationId: string;
  requestedBy: string;
}

export type JobEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
export type JobStatus =
  'PENDING' | 'LEASED' | 'RETRY_SCHEDULED' | 'SUCCEEDED' | 'DEAD' | 'CANCELLED';

export interface EnqueueJobInput extends JobContext {
  environment: JobEnvironment;
  jobType: string;
  idempotencyKey: string;
  payloadReference: string;
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: Date;
}

export interface JobReference {
  id: string;
}
export interface JobDispatcher {
  enqueue(input: EnqueueJobInput): Promise<JobReference>;
}

export interface Job extends Required<
  Omit<EnqueueJobInput, 'bunshinId' | 'capabilityType' | 'scheduledAt'>
> {
  id: string;
  bunshinId: string | null;
  capabilityType: CapabilityType | null;
  status: JobStatus;
  scheduledAt: Date;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  nextRetryAt: Date | null;
  lastErrorCategory: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface JobFailure {
  errorCategory: string;
  retryable: boolean;
}

export interface JobRepository {
  enqueue(input: EnqueueJobInput): Promise<Job>;
  claim(input: {
    environment: JobEnvironment;
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<Job | null>;
  complete(input: { jobId: string; workerId: string; now: Date }): Promise<Job | null>;
  fail(input: {
    jobId: string;
    workerId: string;
    now: Date;
    failure: JobFailure;
    nextRetryAt: Date | null;
  }): Promise<Job | null>;
  cancel(input: { jobId: string; environment: JobEnvironment; now: Date }): Promise<Job | null>;
}

const assertJobText = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `${field} is invalid`);
};

export class EnqueueJob implements JobDispatcher {
  constructor(private readonly repository: JobRepository) {}
  async enqueue(input: EnqueueJobInput): Promise<JobReference> {
    assertJobText(input.jobType, 'jobType', 80);
    assertJobText(input.idempotencyKey, 'idempotencyKey', 200);
    assertJobText(input.payloadReference, 'payloadReference', 500);
    if ((input.priority ?? 100) < 0 || (input.maxAttempts ?? 5) < 1)
      throw new ApplicationError('VALIDATION_ERROR', 'job retry policy is invalid');
    const job = await this.repository.enqueue(input);
    return { id: job.id };
  }
}

export class ClaimJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly leaseMilliseconds = 60_000,
    private readonly now = () => new Date(),
  ) {}
  execute(environment: JobEnvironment, workerId: string) {
    assertJobText(workerId, 'workerId', 120);
    const now = this.now();
    return this.repository.claim({
      environment,
      workerId,
      now,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMilliseconds),
    });
  }
}

export class CompleteJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(jobId: string, workerId: string) {
    const job = await this.repository.complete({ jobId, workerId, now: this.now() });
    if (!job) throw new ApplicationError('CONFLICT', 'job lease is no longer valid');
    return job;
  }
}

export class FailJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly now = () => new Date(),
    private readonly baseDelayMilliseconds = 30_000,
    private readonly maximumDelayMilliseconds = 3_600_000,
  ) {}
  async execute(job: Job, workerId: string, failure: JobFailure) {
    const now = this.now();
    const exhausted = job.attemptCount >= job.maxAttempts;
    const delay = Math.min(
      this.baseDelayMilliseconds * 2 ** Math.max(job.attemptCount - 1, 0),
      this.maximumDelayMilliseconds,
    );
    const nextRetryAt = failure.retryable && !exhausted ? new Date(now.getTime() + delay) : null;
    const updated = await this.repository.fail({
      jobId: job.id,
      workerId,
      now,
      failure,
      nextRetryAt,
    });
    if (!updated) throw new ApplicationError('CONFLICT', 'job lease is no longer valid');
    return updated;
  }
}

export class CancelJob {
  constructor(
    private readonly repository: JobRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(jobId: string, environment: JobEnvironment) {
    const job = await this.repository.cancel({ jobId, environment, now: this.now() });
    if (!job) throw new ApplicationError('CONFLICT', 'job cannot be cancelled');
    return job;
  }
}
