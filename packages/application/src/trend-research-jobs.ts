import { ApplicationError } from '@bunshin/shared';
import type { EnqueueJob, JobEnvironment } from './index';

export interface TrendResearchAutomationCandidate {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  socialProfileId: string;
}

export interface TrendResearchAutomationCandidateRepository {
  listEligible(limit: number): Promise<{
    candidates: TrendResearchAutomationCandidate[];
    truncated: boolean;
  }>;
}

export interface TrendResearchAutomationScopeRepository {
  validateTrend(
    input: TrendResearchAutomationCandidate & { periodStart: string },
  ): Promise<boolean>;
}

export interface TrendResearchScheduleSummary {
  environment: JobEnvironment;
  candidates: number;
  enqueued: number;
  skipped: number;
  failures: number;
  truncated: boolean;
}

const monday = (at: Date) => {
  const value = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const distance = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - distance);
  return value.toISOString().slice(0, 10);
};

export class ScheduleWeeklyTrendResearch {
  constructor(
    private readonly jobs: EnqueueJob,
    private readonly scopes: TrendResearchAutomationScopeRepository,
  ) {}

  async execute(
    input: TrendResearchAutomationCandidate & {
      environment: JobEnvironment;
      periodStart: string;
      correlationId: string;
    },
  ) {
    if (!(await this.scopes.validateTrend(input)))
      throw new ApplicationError('FORBIDDEN', 'trend research automation is not eligible');
    return this.jobs.enqueue({
      environment: input.environment,
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL',
      correlationId: input.correlationId,
      requestedBy: input.actorUserId,
      jobType: 'TREND_RESEARCH_REFRESH',
      payloadReference: `trend-research:${input.socialProfileId}:${input.periodStart}`,
      idempotencyKey: `trend-research:${input.workspaceId}:${input.bunshinId}:${input.socialProfileId}:${input.periodStart}`,
      priority: 150,
      maxAttempts: 3,
    });
  }
}

export class RunTrendResearchScheduler {
  constructor(
    private readonly candidates: TrendResearchAutomationCandidateRepository,
    private readonly schedule: ScheduleWeeklyTrendResearch,
    private readonly now = () => new Date(),
    private readonly limit = 1_000,
  ) {}

  async execute(environment: JobEnvironment): Promise<TrendResearchScheduleSummary> {
    const at = this.now();
    if (at.getUTCDay() !== 1 || at.getUTCHours() !== 0 || at.getUTCMinutes() !== 0)
      return {
        environment,
        candidates: 0,
        enqueued: 0,
        skipped: 0,
        failures: 0,
        truncated: false,
      };
    const values = await this.candidates.listEligible(this.limit);
    const summary: TrendResearchScheduleSummary = {
      environment,
      candidates: values.candidates.length,
      enqueued: 0,
      skipped: 0,
      failures: 0,
      truncated: values.truncated,
    };
    const periodStart = monday(at);
    for (const candidate of values.candidates) {
      try {
        await this.schedule.execute({
          ...candidate,
          environment,
          periodStart,
          correlationId: `trend-scheduler:${environment}:${periodStart}`,
        });
        summary.enqueued += 1;
      } catch (error) {
        if (error instanceof ApplicationError && error.code === 'FORBIDDEN') summary.skipped += 1;
        else summary.failures += 1;
      }
    }
    return summary;
  }
}

export interface TrendResearchExpiryRepository {
  expire(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    at: Date;
  }): Promise<{ runs: number; evidence: number; candidates: number } | null>;
}

export interface TrendResearchGenerationContext {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  socialProfileId: string;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'X' | 'THREADS' | 'YOUTUBE_SHORTS' | 'OTHER';
  purpose: string;
  preferredFormats: Array<'TEXT' | 'SLIDE' | 'IMAGE' | 'LIVE_ACTION' | 'AI_VIDEO_PROMPT'>;
  concept: string;
  targetSummary: string;
  contentPillars: string[];
}

export interface TrendResearchGenerationContextRepository {
  get(input: TrendResearchAutomationCandidate): Promise<TrendResearchGenerationContext | null>;
}

export class ExpireTrendResearchData {
  constructor(private readonly repository: TrendResearchExpiryRepository) {}

  async execute(input: { workspaceId: string; bunshinId: string; actorUserId: string; at?: Date }) {
    const at = input.at ?? new Date();
    if (Number.isNaN(at.valueOf())) throw new ApplicationError('VALIDATION_ERROR', 'invalid time');
    const value = await this.repository.expire({ ...input, at });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'trend research scope not found');
    return value;
  }
}
