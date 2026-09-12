import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scheduler = readFileSync('src/services/weekly-report-line-scheduler.ts', 'utf8');
const handler = readFileSync('src/jobs/service-line-broadcast-job-handler.ts', 'utf8');
const route = readFileSync(
  'app/api/services/[serviceSlug]/weekly-report-delivery/route.ts',
  'utf8',
);

describe('service weekly report LINE boundary', () => {
  it('limits automatic recipients to active consenting participants on the active configuration', () => {
    expect(scheduler).toContain("serviceRole: 'PARTICIPANT'");
    expect(scheduler).toContain('notificationConsentAt: { not: null }');
    expect(scheduler).toContain('configurationId: configuration.id');
    expect(scheduler).toContain('automationKey');
  });

  it('keeps personalized messages on the recipient and exposes only an authenticated update route', () => {
    expect(handler).toContain('recipient.message ?? broadcast.message');
    expect(route).toContain('updateServiceWeeklyReportDeliveryResponse');
    expect(route).not.toContain('GET(');
  });

  it('includes the participant expiry amount and nearest date in the existing weekly message', () => {
    expect(scheduler).toContain('asOf: now');
    expect(scheduler).toContain('report.expiringPoints');
    expect(scheduler).toContain('report.nextPointExpiryAt');
    expect(scheduler).toContain('pointExpiry:');
  });
});
