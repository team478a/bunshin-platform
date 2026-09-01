import { describe, expect, it, vi } from 'vitest';
import { ExpireServiceCredits } from '../src';

describe('ExpireServiceCredits', () => {
  it('runs with a bounded batch limit', async () => {
    const expire = vi.fn().mockResolvedValue(3);
    await expect(new ExpireServiceCredits({ expire }).execute({ limit: 50 })).resolves.toBe(3);
    expect(expire).toHaveBeenCalledWith({ limit: 50, now: expect.any(Date) });
  });

  it('rejects an unsafe batch limit', async () => {
    await expect(
      new ExpireServiceCredits({ expire: vi.fn() }).execute({ limit: 0 }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
