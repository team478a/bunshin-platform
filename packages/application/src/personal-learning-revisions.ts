/** A prepared proposal is not an executable plan switch. No persistence or authorization here. */
export function personalLearningRevisionFlags<
  T extends {
    planId: string;
    revision: number;
    status: string;
  },
>(rows: readonly T[], row: T) {
  const samePlan = rows.filter((other) => other.planId === row.planId);
  const latest = samePlan.reduce((a, b) => (a.revision > b.revision ? a : b));
  const executable = samePlan.filter((other) => ['CONFIRMED', 'COMPLETED'].includes(other.status));
  const current = executable.length
    ? executable.reduce((a, b) => (a.revision > b.revision ? a : b))
    : latest;
  return {
    isCurrent: row.revision === current.revision && row.status !== 'SUPERSEDED',
    isLatestProposal: row.status === 'DRAFT' && row.revision === latest.revision,
  };
}
