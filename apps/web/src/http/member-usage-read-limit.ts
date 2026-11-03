import 'server-only';

interface Window {
  resetAt: number;
  count: number;
  inFlight: Set<string>;
}

/** Per-process load guard, not a distributed quota. No usage data is cached. */
export class MemberUsageReadLimit {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit = 10,
    private readonly windowMs = 60_000,
    private readonly capacity = 1_000,
  ) {}

  reserve(
    userId: string,
    now = Date.now(),
    scope = 'default',
  ): { allowed: true; release: () => void } | { allowed: false; retryAfterSeconds: number } {
    for (const [key, row] of this.windows) {
      if (row.inFlight.size === 0 && row.resetAt <= now) this.windows.delete(key);
    }
    let row = this.windows.get(userId);
    if (!row) {
      if (this.windows.size >= this.capacity)
        return { allowed: false, retryAfterSeconds: Math.ceil(this.windowMs / 1_000) };
      row = { resetAt: now + this.windowMs, count: 0, inFlight: new Set<string>() };
      this.windows.set(userId, row);
    }
    if (row.inFlight.has(scope)) return { allowed: false, retryAfterSeconds: 1 };
    if (row.count >= this.limit)
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((row.resetAt - now) / 1_000)),
      };
    row.count += 1;
    row.inFlight.add(scope);
    let released = false;
    return {
      allowed: true,
      release: () => {
        if (!released) {
          row.inFlight.delete(scope);
          released = true;
        }
      },
    };
  }
}

export const memberUsageReadLimit = new MemberUsageReadLimit();
