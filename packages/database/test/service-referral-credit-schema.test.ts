import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260901160000_add_service_referral_credit_core/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service referral credit persistence', () => {
  it('keeps inbound service referrals separate from outbound tracking links', () => {
    expect(schema).toContain('model ServiceReferralCode');
    expect(schema).toContain('model ServiceReferralClick');
    expect(schema).toContain('model ServiceReferral');
    expect(schema).toContain('model ExternalTrackingLink');
  });

  it('prevents a referred membership from being attributed more than once', () => {
    expect(schema).toContain('@@unique([workspaceId, groupId, referredMembershipId])');
    expect(migration).toContain('service_referrals_referred_membership_key');
  });

  it('stores credits and their idempotent history within one service', () => {
    expect(schema).toContain('model ServiceCreditAccount');
    expect(schema).toContain('model ServiceCreditLedger');
    expect(schema).toContain('@@unique([accountId, idempotencyKey])');
    expect(migration).toContain('service_credit_ledger_idempotency_key');
  });

  it('does not add external conversion or cash-reward storage', () => {
    expect(schema).not.toContain('serviceReferralCashReward');
    expect(schema).not.toContain('serviceReferralConversionAmount');
  });
});
