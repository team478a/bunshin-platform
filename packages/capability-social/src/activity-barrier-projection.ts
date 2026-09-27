import { inferSocialActivityBarriers } from './activity-barrier';
import type {
  SocialActivityBarrierCaseRepository,
  SocialActivityBarrierObservationRepository,
  SocialActivityBarrierProjectionCandidateRepository,
} from './activity-barrier-persistence';

const DAY = 24 * 60 * 60 * 1_000;
const TOKYO_OFFSET = 9 * 60 * 60 * 1_000;

export type SocialActivityBarrierProjectionSummary = {
  due: boolean;
  scanned: number;
  evaluated: number;
  suspected: number;
  noSignals: number;
  skipped: number;
  failures: number;
  truncated: boolean;
};

export function socialActivityBarrierObservationWindow(at: Date) {
  const tokyo = new Date(at.getTime() + TOKYO_OFFSET);
  const observationTo = new Date(
    Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate()) - TOKYO_OFFSET,
  );
  return { from: new Date(observationTo.getTime() - 28 * DAY), to: observationTo };
}

export function isSocialActivityBarrierProjectionDue(at: Date) {
  const tokyo = new Date(at.getTime() + TOKYO_OFFSET);
  return tokyo.getUTCHours() === 3 && tokyo.getUTCMinutes() === 10;
}

export class RunSocialActivityBarrierProjectionBatch {
  constructor(
    private readonly candidates: SocialActivityBarrierProjectionCandidateRepository,
    private readonly observations: SocialActivityBarrierObservationRepository,
    private readonly cases: SocialActivityBarrierCaseRepository,
  ) {}

  async execute(input: { at?: Date; limit?: number; force?: boolean } = {}) {
    const at = input.at ?? new Date();
    const limit = input.limit ?? 100;
    const summary: SocialActivityBarrierProjectionSummary = {
      due: input.force === true || isSocialActivityBarrierProjectionDue(at),
      scanned: 0,
      evaluated: 0,
      suspected: 0,
      noSignals: 0,
      skipped: 0,
      failures: 0,
      truncated: false,
    };
    if (!summary.due) return summary;

    const scopes = await this.candidates.list({ limit, at });
    summary.scanned = scopes.length;
    summary.truncated = scopes.length === limit;
    const window = socialActivityBarrierObservationWindow(at);
    for (const scope of scopes) {
      try {
        const observation = await this.observations.collect({ scope, ...window });
        if (!observation) {
          summary.skipped += 1;
          continue;
        }
        summary.evaluated += 1;
        const inferred = inferSocialActivityBarriers(observation);
        if (inferred.length === 0) {
          summary.noSignals += 1;
          continue;
        }
        const saved = await this.cases.saveSuspicions({
          scope,
          candidates: inferred,
          detectedAt: at,
        });
        if (!saved) summary.skipped += 1;
        else summary.suspected += saved.length;
      } catch {
        summary.failures += 1;
      }
    }
    return summary;
  }
}
