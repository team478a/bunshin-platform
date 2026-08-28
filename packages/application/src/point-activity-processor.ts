import { ApplicationError } from '@bunshin/shared';

export const POINT_ACTIVITY_EVENT_TYPES = ['MISSION_VIEWED', 'POSTED'] as const;
export type PointActivityEventType = (typeof POINT_ACTIVITY_EVENT_TYPES)[number];

export interface PointActivityCandidate {
  workspaceId: string;
  actorUserId: string;
  eventType: PointActivityEventType;
  sourceEventId: string;
  occurredAt: Date;
}

export type PointActivityProcessResult =
  'GRANTED' | 'ALREADY_PROCESSED' | 'NO_ACTIVE_RULE' | 'NOT_ELIGIBLE';

export interface PointActivityProcessorRepository {
  listCandidates(input: { limit: number }): Promise<PointActivityCandidate[]>;
  process(
    input: PointActivityCandidate & { timezone: string },
  ): Promise<PointActivityProcessResult>;
}

export class ProcessPointActivityBatch {
  constructor(private readonly repository: PointActivityProcessorRepository) {}

  async execute(input: { limit?: number; timezone?: string } = {}) {
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid point processor limit');
    const timezone = input.timezone?.trim() || 'Asia/Tokyo';
    try {
      new Intl.DateTimeFormat('ja-JP', { timeZone: timezone }).format(new Date());
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid point processor timezone');
    }
    const candidates = await this.repository.listCandidates({ limit });
    const results: Record<PointActivityProcessResult, number> = {
      GRANTED: 0,
      ALREADY_PROCESSED: 0,
      NO_ACTIVE_RULE: 0,
      NOT_ELIGIBLE: 0,
    };
    for (const candidate of candidates) {
      results[await this.repository.process({ ...candidate, timezone })] += 1;
    }
    return { scanned: candidates.length, ...results };
  }
}
