import { describe, expect, it } from 'vitest';
import { fortuneInventoryHealth, fortuneLicenseState } from '../src/fortune/admin-inventory';

describe('fortune package admin inventory', () => {
  const now = new Date('2026-09-17T00:00:00.000Z');

  it('distinguishes every contract state without treating future or ended access as active', () => {
    expect(fortuneLicenseState(null, now)).toBe('NOT_LICENSED');
    expect(
      fortuneLicenseState(
        {
          fortunePackageEnabled: true,
          suspended: true,
          startsAt: null,
          endsAt: null,
        },
        now,
      ),
    ).toBe('SUSPENDED');
    expect(
      fortuneLicenseState(
        {
          fortunePackageEnabled: true,
          suspended: false,
          startsAt: new Date('2026-09-18T00:00:00.000Z'),
          endsAt: null,
        },
        now,
      ),
    ).toBe('NOT_STARTED');
    expect(
      fortuneLicenseState(
        {
          fortunePackageEnabled: true,
          suspended: false,
          startsAt: null,
          endsAt: new Date('2026-09-17T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe('ENDED');
    expect(
      fortuneLicenseState(
        {
          fortunePackageEnabled: true,
          suspended: false,
          startsAt: null,
          endsAt: null,
        },
        now,
      ),
    ).toBe('ACTIVE');
  });

  it('prioritizes stopped, incompatible, and outdated services before normal readiness', () => {
    const healthy = {
      organizationActive: true,
      projectActive: true,
      configured: true,
      enabled: true,
      readyCount: 5,
      packageReleaseState: 'CURRENT' as const,
    };
    expect(fortuneInventoryHealth(healthy)).toBe('LIVE');
    expect(fortuneInventoryHealth({ ...healthy, projectActive: false })).toBe('STOPPED');
    expect(fortuneInventoryHealth({ ...healthy, packageReleaseState: 'UNSUPPORTED_NEWER' })).toBe(
      'UNSUPPORTED_VERSION',
    );
    expect(fortuneInventoryHealth({ ...healthy, packageReleaseState: 'UPDATE_AVAILABLE' })).toBe(
      'UPDATE_REQUIRED',
    );
    expect(fortuneInventoryHealth({ ...healthy, readyCount: 4 })).toBe('ATTENTION');
    expect(fortuneInventoryHealth({ ...healthy, packageReleaseState: 'NOT_SELECTED' })).toBe(
      'ATTENTION',
    );
    expect(fortuneInventoryHealth({ ...healthy, enabled: false })).toBe('READY');
    expect(
      fortuneInventoryHealth({ ...healthy, configured: false, enabled: false, readyCount: 0 }),
    ).toBe('PREPARING');
  });
});
