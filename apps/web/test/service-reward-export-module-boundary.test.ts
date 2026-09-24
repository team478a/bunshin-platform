import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('service reward export module boundary', () => {
  it('keeps authentication, service resolution, and response headers in the HTTP module', () => {
    const handler = source('src/http/service-reward-export.ts');
    expect(handler).toContain('currentUserProvider');
    expect(handler).toContain('resolveManagedServiceContext');
    expect(handler).toContain("'x-content-type-options': 'nosniff'");
    expect(handler).not.toContain('pointTransaction.findMany');
    expect(handler).not.toContain('badgeAward.findMany');
  });

  it('separates ledger, audit, and pilot queries', () => {
    const ledger = source('src/http/service-reward-export-ledger.ts');
    const audit = source('src/http/service-reward-export-audit.ts');
    const pilot = source('src/http/service-reward-export-pilot.ts');
    expect(ledger).toContain('pointTransaction.findMany');
    expect(ledger).toContain('badgeAward.findMany');
    expect(ledger).not.toContain('badgeAdminAuditLog.findMany');
    expect(audit).toContain('badgeAdminAuditLog.findMany');
    expect(audit).not.toContain('resolveRewardsPilotMeasurementPeriod');
    expect(pilot).toContain('resolveRewardsPilotMeasurementPeriod');
    expect(pilot).toContain('buildRewardsPilotMetrics');
  });
});
