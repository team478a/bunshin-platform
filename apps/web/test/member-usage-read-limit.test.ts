import { describe, expect, it } from 'vitest';
import { MemberUsageReadLimit } from '../src/http/member-usage-read-limit';

describe('member usage process load guard', () => {
  it('limits concurrent reads and releases a lease idempotently', () => {
    const guard = new MemberUsageReadLimit();
    const first = guard.reserve('owner', 0);
    expect(first.allowed).toBe(true);
    expect(guard.reserve('owner', 1)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    if (!first.allowed) throw new Error('expected lease');
    first.release();
    const second = guard.reserve('owner', 2);
    first.release();
    expect(guard.reserve('owner', 3).allowed).toBe(false);
    if (!second.allowed) throw new Error('expected second lease');
    second.release();
    expect(guard.reserve('owner', 4).allowed).toBe(true);
  });

  it('enforces ten reads per minute and resets at the exact boundary', () => {
    const guard = new MemberUsageReadLimit();
    for (let n = 0; n < 10; n++) {
      const permit = guard.reserve('owner', n);
      if (!permit.allowed) throw new Error('expected lease');
      permit.release();
    }
    expect(guard.reserve('owner', 59_001)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(guard.reserve('owner', 60_000).allowed).toBe(true);
  });

  it('isolates users but never evicts an unexpired entry to admit a new user', () => {
    const guard = new MemberUsageReadLimit(1, 60_000, 2);
    const first = guard.reserve('owner-a', 0);
    if (!first.allowed) throw new Error('expected lease');
    first.release();
    expect(guard.reserve('owner-b', 1).allowed).toBe(true);
    expect(guard.reserve('owner-c', 2)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(guard.reserve('owner-a', 3).allowed).toBe(false);
    expect(guard.reserve('owner-c', 60_000).allowed).toBe(true);
  });

  it('retains an in-flight lease after its window expires', () => {
    const guard = new MemberUsageReadLimit(10, 60_000, 1);
    const permit = guard.reserve('owner-a', 0);
    if (!permit.allowed) throw new Error('expected lease');
    expect(guard.reserve('owner-a', 60_000).allowed).toBe(false);
    expect(guard.reserve('owner-b', 60_000).allowed).toBe(false);
    permit.release();
    expect(guard.reserve('owner-b', 60_000).allowed).toBe(true);
  });
});
