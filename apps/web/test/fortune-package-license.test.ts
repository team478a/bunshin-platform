import { describe, expect, it } from 'vitest';
import { isFortunePackageLicenseActive } from '../src/services/fortune-package-license';

const now = new Date('2026-09-17T00:00:00.000Z');

describe('fortune package license', () => {
  it('allows the package only while the organization contract is active', () => {
    expect(
      isFortunePackageLicenseActive(
        {
          fortunePackageEnabled: true,
          suspended: false,
          startsAt: new Date('2026-09-01T00:00:00.000Z'),
          endsAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('rejects missing, disabled, suspended, future, and expired licenses', () => {
    expect(isFortunePackageLicenseActive(null, now)).toBe(false);
    expect(
      isFortunePackageLicenseActive(
        {
          fortunePackageEnabled: false,
          suspended: false,
          startsAt: null,
          endsAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isFortunePackageLicenseActive(
        {
          fortunePackageEnabled: true,
          suspended: true,
          startsAt: null,
          endsAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isFortunePackageLicenseActive(
        {
          fortunePackageEnabled: true,
          suspended: false,
          startsAt: new Date('2026-09-18T00:00:00.000Z'),
          endsAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isFortunePackageLicenseActive(
        {
          fortunePackageEnabled: true,
          suspended: false,
          startsAt: null,
          endsAt: now,
        },
        now,
      ),
    ).toBe(false);
  });
});
