import {
  sameImprovementScope,
  sanitizeImprovementObservation,
  validateImprovementScope,
  validateImprovementCoverage,
  type ImprovementScope,
  type ImprovementObservation,
  type ImprovementCoverage,
  type ImprovementAdapterDefinition,
  type ImprovementSafeObservation,
} from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export interface ImprovementReadRequest {
  actorUserId: string;
  scope: ImprovementScope;
  fromInclusive: Date;
  toExclusive: Date;
  limit: number;
  subject: { userRef: string; bunshinRef: string | null } | null;
}
export interface ImprovementScopeAuthorizationPort {
  authorize(input: ImprovementReadRequest): Promise<boolean>;
}
/** Implementations must authorize source records and minimize fields before returning them. */
export interface ImprovementObservationAdapter {
  definition: ImprovementAdapterDefinition;
  readObservations(input: ImprovementReadRequest): Promise<{
    observations: readonly ImprovementObservation[];
    coverage: ImprovementCoverage;
  }>;
}
export interface ImprovementObservationCollection {
  observations: ImprovementSafeObservation[];
  coverage: ImprovementCoverage;
  duplicateCount: number;
  adapterVersion: string;
}

/** First bounded batch only. Pagination and persistence will be introduced with the read adapters. */
export class CollectImprovementObservations {
  constructor(
    private readonly authorization: ImprovementScopeAuthorizationPort,
    private readonly adapter: ImprovementObservationAdapter,
  ) {}

  async execute(input: ImprovementReadRequest): Promise<ImprovementObservationCollection> {
    this.validate(input);
    if (
      input.scope.adapterKey !== this.adapter.definition.key ||
      input.scope.packageKey !== this.adapter.definition.packageKey
    )
      throw new ApplicationError('VALIDATION_ERROR', 'improvement adapter mismatch');
    if (!(await this.authorization.authorize(input)))
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    const result = await this.adapter.readObservations(input);
    try {
      validateImprovementCoverage(result.coverage);
      if (result.observations.length > input.limit)
        throw new Error('improvement read limit exceeded');
      const bySource = new Map<string, ImprovementSafeObservation>();
      let duplicateCount = 0;
      for (const row of result.observations) {
        if (
          !sameImprovementScope(input.scope, row.scope) ||
          (input.subject &&
            (row.userRef !== input.subject.userRef ||
              (input.subject.bunshinRef !== null && row.bunshinRef !== input.subject.bunshinRef)))
        )
          throw new Error('improvement source outside scope');
        const safe = sanitizeImprovementObservation(row, this.adapter.definition);
        if (safe.occurredAt < input.fromInclusive || safe.occurredAt >= input.toExclusive)
          throw new Error('improvement source outside period');
        const existing = bySource.get(safe.eventId);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(safe))
            throw new Error('conflicting improvement source');
          duplicateCount += 1;
        } else bySource.set(safe.eventId, safe);
      }
      return {
        observations: [...bySource.values()],
        coverage: {
          completeness: result.coverage.completeness,
          missingCount: result.coverage.missingCount,
          truncated: result.coverage.truncated,
        },
        duplicateCount,
        adapterVersion: this.adapter.definition.version,
      };
    } catch {
      // Never include raw records or validation values in outward errors.
      throw new ApplicationError('VALIDATION_ERROR', 'invalid improvement adapter output');
    }
  }

  private validate(input: ImprovementReadRequest): void {
    try {
      validateImprovementScope(input.scope);
    } catch {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid improvement scope');
    }
    const validRef = (value: string) =>
      typeof value === 'string' && value.length > 0 && value.length <= 240 && !/\s/u.test(value);
    if (
      !validRef(input.actorUserId) ||
      !(input.fromInclusive instanceof Date) ||
      !(input.toExclusive instanceof Date) ||
      !Number.isFinite(input.fromInclusive.getTime()) ||
      !Number.isFinite(input.toExclusive.getTime()) ||
      input.fromInclusive >= input.toExclusive ||
      input.toExclusive.getTime() - input.fromInclusive.getTime() > 90 * 86_400_000 ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 1_000 ||
      (input.subject &&
        (!validRef(input.subject.userRef) ||
          (input.subject.bunshinRef !== null && !validRef(input.subject.bunshinRef))))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid improvement read request');
  }
}
