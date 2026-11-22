export function remainingServiceCreditLots(
  entries: readonly {
    id: string;
    type: 'GRANT' | 'CONSUME' | 'REFUND' | 'EXPIRE' | 'ADJUST';
    amount: number;
    expiresAt: Date | null;
    sourceId: string | null;
  }[],
) {
  const lots = new Map<string, { remaining: number; expiresAt: Date | null }>();
  const consume = (amount: number) => {
    let remaining = amount;
    const candidates = [...lots.entries()]
      .filter(([, lot]) => lot.remaining > 0)
      .sort(([, left], [, right]) => {
        if (left.expiresAt === null) return right.expiresAt === null ? 0 : 1;
        if (right.expiresAt === null) return -1;
        return left.expiresAt.getTime() - right.expiresAt.getTime();
      });
    for (const [, lot] of candidates) {
      const used = Math.min(lot.remaining, remaining);
      lot.remaining -= used;
      remaining -= used;
      if (remaining === 0) break;
    }
  };
  for (const entry of entries) {
    if (entry.type === 'GRANT')
      lots.set(entry.id, { remaining: entry.amount, expiresAt: entry.expiresAt });
    else if (
      (entry.type === 'EXPIRE' || entry.type === 'ADJUST') &&
      entry.amount < 0 &&
      entry.sourceId?.startsWith('grant:')
    ) {
      const grant = lots.get(entry.sourceId.slice('grant:'.length));
      if (grant) grant.remaining = Math.max(0, grant.remaining + entry.amount);
    } else if (entry.type === 'CONSUME' || (entry.type === 'ADJUST' && entry.amount < 0))
      consume(-entry.amount);
    else if (entry.type === 'REFUND' || (entry.type === 'ADJUST' && entry.amount > 0))
      lots.set(entry.id, { remaining: entry.amount, expiresAt: null });
  }
  return lots;
}
