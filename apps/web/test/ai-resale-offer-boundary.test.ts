import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const participantHttp = source('src/http/ai-resale-offer.ts');
const adminHttp = source('src/http/ai-resale-offer-admin.ts');
const participantCard = source(
  'app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-resale-offer-card.tsx',
);
const adminCard = source('app/s/[serviceSlug]/manage/programs/ai-resale-offer-admin.tsx');

describe('AI resale DAY7 offer web boundary', () => {
  it('requires the participant session, service membership, same origin, and strict input', () => {
    expect(participantHttp).toContain('getCurrentUser()');
    expect(participantHttp).toContain('resolveMemberServiceContext(serviceSlug, actor.userId)');
    expect(participantHttp).toContain('requireSameOrigin(request)');
    expect(participantHttp).toContain('.strict()');
    expect(participantHttp).toContain('workspaceId: service.workspaceId');
    expect(participantHttp).toContain('groupId: service.serviceId');
  });

  it('shows classification copy and reads the amount from the returned offering', () => {
    expect(participantCard).toContain('message[state.classification]');
    expect(participantCard).toContain('state.offer.terms.amountYen');
    expect(participantCard).toContain("state.status === 'STANDARD'");
    expect(participantCard).toContain("type: 'DECLINE_STANDARD'");
    expect(participantCard).toContain("type: 'SELECT'");
  });

  it('keeps external payment separate from paid access activation', () => {
    expect(participantCard).toContain('申込み希望を受け付けました');
    expect(participantCard).toContain('運営者が入金を確認しています');
    expect(adminCard).toContain('外部決済の確認番号');
    expect(adminCard).toContain('入金確認済みとして90日利用を開始する');
    expect(adminHttp).toContain('externalPaymentConfirmation');
    expect(adminHttp).toContain("eventType: 'PAID_ENROLLED'");
  });

  it('requires a completed DAY7 trial and gives exactly 90 calendar days', () => {
    expect(adminHttp).toContain("status: 'COMPLETED'");
    expect(adminHttp).toContain('DAY7 classification required');
    expect(adminHttp).toContain('participant offer selection required');
    expect(adminHttp).toContain("? 'STANDARD_OFFER_SELECTED'");
    expect(adminHttp).toContain(": 'MONITOR_OFFER_SELECTED'");
    expect(adminHttp).toContain('db.addProgramCalendarDays');
    expect(adminHttp).toContain('terms.durationDays');
    expect(adminHttp).toContain("paidRuntime?.policyKey !== 'PAID_90D'");
  });

  it('lets the service manager configure prices and optional HTTPS application URLs', () => {
    expect(adminHttp).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
    expect(adminHttp).toContain("z.string().url().startsWith('https://')");
    expect(adminCard).toContain('standardAmountYen');
    expect(adminCard).toContain('monitorAmountYen');
  });
});
