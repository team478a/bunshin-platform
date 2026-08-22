import { describe, expect, it, vi } from 'vitest';
import {
  CheckLineOperationalReadiness,
  NotifyLineOperationalAlerts,
  assessLineOperationalReadiness,
  type LineOperationalSnapshot,
} from '../src';

const healthy = (): LineOperationalSnapshot => ({
  environment: 'PRODUCTION',
  configuration: { active: true, verified: true, globallyPaused: false },
  deliveries: { failed: 0 },
  jobs: { retryScheduled: 0, dead: 0 },
  failures: [],
});

describe('LINE operational readiness', () => {
  it('reports a healthy environment without sending an alert', async () => {
    const notify = vi.fn();
    const result = await new NotifyLineOperationalAlerts(
      new CheckLineOperationalReadiness(
        { get: vi.fn().mockResolvedValue(healthy()) },
        () => new Date('2026-08-22T08:00:00Z'),
      ),
      { notify },
    ).execute('PRODUCTION');

    expect(result).toMatchObject({ environment: 'PRODUCTION', ready: true, alerts: [] });
    expect(notify).not.toHaveBeenCalled();
  });

  it('classifies configuration, dead job and credential failures as critical', () => {
    const result = assessLineOperationalReadiness({
      ...healthy(),
      configuration: { active: true, verified: false, globallyPaused: false },
      deliveries: { failed: 2 },
      jobs: { retryScheduled: 1, dead: 1 },
      failures: [{ category: 'CREDENTIAL_INVALID', count: 2 }],
    });

    expect(result.ready).toBe(false);
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ACTIVE_CONFIGURATION_UNVERIFIED', severity: 'CRITICAL' }),
        expect.objectContaining({ code: 'DEAD_DELIVERY_JOBS', severity: 'CRITICAL', count: 1 }),
        expect.objectContaining({
          code: 'DELIVERY_FAILURE_CREDENTIAL_INVALID',
          severity: 'CRITICAL',
          count: 2,
        }),
      ]),
    );
  });

  it('refuses a repository response from another environment', async () => {
    const check = new CheckLineOperationalReadiness({
      get: vi.fn().mockResolvedValue({ ...healthy(), environment: 'STAGING' }),
    });

    await expect(check.execute('PRODUCTION')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('uses the same fingerprint for equivalent alert states', () => {
    const snapshot = { ...healthy(), jobs: { retryScheduled: 2, dead: 0 } };
    const first = assessLineOperationalReadiness(snapshot, new Date('2026-08-22T08:00:00Z'));
    const second = assessLineOperationalReadiness(snapshot, new Date('2026-08-22T09:00:00Z'));
    expect(first.fingerprint).toBe(second.fingerprint);
  });
});
