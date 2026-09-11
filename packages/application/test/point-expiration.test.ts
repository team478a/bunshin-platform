import { describe, expect, it, vi } from 'vitest';
import {
  ExpireAvailablePointGrants,
  type PointExpirationRepository,
} from '../src/point-expiration';

describe('point expiration', () => {
  it('expires a bounded batch at the supplied time', async () => {
    const repository: PointExpirationRepository = {
      expireAvailableGrants: vi.fn().mockResolvedValue({ expiredGrants: 2, expiredPoints: 8 }),
    };
    const now = new Date('2027-03-31T15:00:00Z');

    await expect(
      new ExpireAvailablePointGrants(repository).execute({ now, limit: 50 }),
    ).resolves.toEqual({ expiredGrants: 2, expiredPoints: 8 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repository.expireAvailableGrants).toHaveBeenCalledWith({ now, limit: 50 });
  });

  it('rejects an unbounded batch', () => {
    const repository: PointExpirationRepository = {
      expireAvailableGrants: vi.fn(),
    };
    expect(() => new ExpireAvailablePointGrants(repository).execute({ limit: 501 })).toThrow(
      'invalid point expiration limit',
    );
  });
});
