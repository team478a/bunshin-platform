import type { MissionDecision } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

export type MissionDecisionSummary = Pick<MissionDecision, 'decision' | 'rejectionReason'>;

export async function missionDecisionOrPending(
  load: () => Promise<MissionDecision>,
): Promise<MissionDecisionSummary> {
  try {
    const value = await load();
    return { decision: value.decision, rejectionReason: value.rejectionReason };
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') {
      return { decision: 'PENDING', rejectionReason: null };
    }
    throw error;
  }
}
