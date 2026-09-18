import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scheduler = source('src/services/ai-resale-offer-line-scheduler.ts');
const handler = source('src/jobs/service-line-broadcast-job-handler.ts');
const missionScheduler = source('src/http/mission-scheduler.ts');
const managementPage = source('app/s/[serviceSlug]/manage/programs/page.tsx');
const managementCard = source('app/s/[serviceSlug]/manage/programs/ai-resale-offer-admin.tsx');

describe('AI resale DAY7 offer LINE and funnel boundary', () => {
  it('schedules one consented notification for an unhandled DAY7 classification', () => {
    expect(scheduler).toContain('classified."event_type" = \'DAY7_CLASSIFIED\'');
    expect(scheduler).toContain('handled."event_type" IN');
    expect(scheduler).toContain("state?.status !== 'STANDARD'");
    expect(scheduler).toContain("kind: 'AI_RESALE_OFFER'");
    expect(scheduler).toContain('notificationConsentAt: { not: null }');
    expect(scheduler).toContain("friendshipStatus: 'FOLLOWING'");
    expect(scheduler).toContain('automationKey: key');
  });

  it('revalidates the current offer immediately before LINE delivery', () => {
    expect(handler).toContain("criteria.kind === 'AI_RESALE_OFFER'");
    expect(handler).toContain("state?.status !== 'STANDARD'");
    expect(handler).toContain('state.offer?.offeringId !== criteria.offeringId');
    expect(handler).toContain("eventType: 'STANDARD_OFFER_SHOWN'");
    expect(handler).toContain('alreadyShown');
  });

  it('runs the offer notification after the resale runtime in the scheduler', () => {
    expect(missionScheduler).toContain('scheduleAiResaleOfferLineDeliveries');
    expect(missionScheduler).toContain('aiResaleOfferLine');
  });

  it('shows the DAY7, LINE, offer, selection, and paid funnel from persisted data', () => {
    expect(managementPage).toContain("'DAY7_CLASSIFIED'");
    expect(managementPage).toContain("'STANDARD_OFFER_SHOWN'");
    expect(managementPage).toContain("'PAID_ENROLLED'");
    expect(managementPage).toContain("equals: 'AI_RESALE_OFFER'");
    expect(managementCard).toContain('DAY7から有料開始まで');
    expect(managementCard).toContain('LINEで案内済み');
    expect(managementCard).toContain('90日利用開始');
  });
});
