import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/http/mission-scheduler.ts', import.meta.url), 'utf8');
const notificationSource = readFileSync(
  new URL('../src/services/social-activity-barrier-line-scheduler.ts', import.meta.url),
  'utf8',
);
const eligibilitySource = readFileSync(
  new URL('../src/jobs/service-line-broadcast-eligibility.ts', import.meta.url),
  'utf8',
);

describe('social activity barrier scheduler boundary', () => {
  it('connects the scoped daily projection to the existing scheduler', () => {
    expect(source).toContain('RunSocialActivityBarrierProjectionBatch');
    expect(source).toContain('PrismaSocialActivityBarrierProjectionCandidateRepository');
    expect(source).toContain('PrismaSocialActivityBarrierObservationRepository');
    expect(source).toContain('PrismaSocialActivityBarrierCaseRepository');
    expect(source).toContain('socialActivityBarriers: socialActivityBarrierResult');
  });

  it('schedules one consented LINE entry notification and revalidates pending cases', () => {
    expect(source).toContain('scheduleSocialActivityBarrierLineNotifications');
    expect(source).toContain('socialActivityBarrierLine');
    expect(notificationSource).toContain("status: 'SUSPECTED'");
    expect(notificationSource).toContain("kind: 'SOCIAL_ACTIVITY_BARRIER'");
    expect(notificationSource).toContain('resolveServiceLineBroadcastRecipientIds');
    expect(notificationSource).toContain('SNS継続支援の本人確認を通知');
    expect(eligibilitySource).toContain("criteria.kind === 'SOCIAL_ACTIVITY_BARRIER'");
    expect(eligibilitySource).toContain("status: 'SUSPECTED'");
  });
});
