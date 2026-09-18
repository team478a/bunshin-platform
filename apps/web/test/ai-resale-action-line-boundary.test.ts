import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scheduler = source('src/services/ai-resale-action-line-scheduler.ts');
const handler = source('src/jobs/service-line-broadcast-job-handler.ts');
const page = source('app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx');

describe('AI resale current Action LINE boundary', () => {
  it('selects only the active participant enrollment and an explicitly connected LINE destination', () => {
    expect(scheduler).toContain("serviceRole: 'PARTICIPANT'");
    expect(scheduler).toContain("status: 'ACTIVE'");
    expect(scheduler).toContain('consentedAt: { not: null }');
    expect(scheduler).toContain('notificationConsentAt: { not: null }');
    expect(scheduler).toContain("friendshipStatus: 'FOLLOWING'");
    expect(scheduler).toContain('configurationId: lineConfiguration.id');
  });

  it('uses one broadcast per assignment and the existing delivery worker', () => {
    expect(scheduler).toContain('ai-resale-action:${environment}:${assignmentId}');
    expect(scheduler).toContain("kind: 'AI_RESALE_ACTION'");
    expect(scheduler).toContain("jobType: 'SERVICE_LINE_BROADCAST_DELIVER'");
    expect(scheduler).toContain('maxAttempts: 3');
    expect(scheduler).toContain('serviceLineBroadcastRecipient.create');
    expect(scheduler).not.toContain('serviceLineBroadcastRecipient.createMany');
  });

  it('rechecks the exact current assignment immediately before delivery', () => {
    expect(handler).toContain("criteria.kind === 'AI_RESALE_ACTION'");
    expect(handler).toContain('programEnrollmentId: criteria.programEnrollmentId');
    expect(handler).toContain('currentAssignmentId: criteria.assignmentId');
    expect(handler).toContain("status: 'PRESENTED'");
    expect(handler).toContain("equals: 'AI_RESALE_V1'");
  });

  it('links to the authenticated participant page, which preserves the return path through login', () => {
    expect(scheduler).toContain('/programs/${encodeURIComponent(candidate.programEnrollmentId)}');
    expect(page).toContain('resolveAuthenticatedMemberServicePage');
    expect(page).toContain('`/s/${serviceSlug}/programs/${programEnrollmentId}`');
  });
});
