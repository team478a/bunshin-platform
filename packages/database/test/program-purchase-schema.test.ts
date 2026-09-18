import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260918213000_add_program_purchases/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const lifecycleMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260918223000_add_program_purchase_lifecycle/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const refundAmountMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260918233000_add_program_purchase_refund_amount/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('program purchase persistence', () => {
  it('scopes purchases to an organization and service with provider idempotency', () => {
    expect(schema).toContain('model ProgramPurchase');
    expect(schema).toContain('@@unique([workspaceId, groupId, idempotencyKey])');
    expect(schema).toContain('providerCheckoutSessionId String?');
    expect(migration).toContain('program_purchases_workspace_id_group_id_idempotency_key_key');
    expect(migration).toContain('program_purchases_payment_configuration_fkey');
  });

  it('deduplicates webhook events without retaining the provider payload', () => {
    expect(schema).toContain('model PaymentWebhookEvent');
    expect(schema).toContain('@@unique([paymentConfigurationId, providerEventId])');
    expect(schema).toContain('payloadDigest');
    expect(schema).not.toContain('rawPayload');
  });

  it('records checkout expiry and refunds with consistent lifecycle timestamps', () => {
    expect(schema).toContain('expiredAt');
    expect(schema).toContain('refundedAt');
    expect(lifecycleMigration).toContain('program_purchases_lifecycle_timestamps_check');
    expect(lifecycleMigration).toContain('program_purchases_status_checkout_expires_at_idx');
    expect(lifecycleMigration).toContain('program_purchases_paid_enrollment_fkey');
  });

  it('records cumulative refund amounts within the original purchase total', () => {
    expect(schema).toContain('refundedAmountYen');
    expect(refundAmountMigration).toContain('refunded_amount_yen');
    expect(refundAmountMigration).toContain('program_purchases_refunded_amount_yen_check');
    expect(refundAmountMigration).toContain('"refunded_amount_yen" <= "amount_yen"');
  });
});
