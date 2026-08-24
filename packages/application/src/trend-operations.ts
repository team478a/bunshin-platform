import { ApplicationError } from '@bunshin/shared';

export interface TrendOperationsSnapshot {
  period: { from: Date; to: Date };
  research: {
    total: number;
    completed: number;
    failed: number;
    expired: number;
    failureCategories: Array<{ category: string; count: number }>;
  };
  candidates: {
    total: number;
    safe: number;
    selected: number;
    averageFreshnessScore: number | null;
  };
  missions: {
    attributed: number;
    accepted: number;
    rejected: number;
    copied: number;
    posted: number;
  };
  evidence: { total: number; available: number; expired: number };
  providers: Array<{ providerKey: string; runs: number; failed: number }>;
  cost: {
    measuredUsdMicros: number | null;
    unpricedRuns: number;
    benchmarkAverageUsdMicros: number | null;
  };
}

export interface TrendOperationsRepository {
  snapshot(input: {
    actorUserId: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    from: Date;
    to: Date;
  }): Promise<TrendOperationsSnapshot | null>;
}

export class GetTrendOperationsSnapshot {
  constructor(private readonly repository: TrendOperationsRepository) {}

  async execute(input: {
    actorUserId: string;
    environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
    from: Date;
    to: Date;
  }) {
    if (
      !input.actorUserId.trim() ||
      Number.isNaN(input.from.getTime()) ||
      Number.isNaN(input.to.getTime()) ||
      input.from >= input.to
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid trend operations period');
    if (input.to.getTime() - input.from.getTime() > 366 * 86_400_000)
      throw new ApplicationError('VALIDATION_ERROR', 'trend operations period is too long');
    const value = await this.repository.snapshot(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'trend operations not found');
    return value;
  }
}
