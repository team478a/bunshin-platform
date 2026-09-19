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
const directPurchaseMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260919190000_allow_direct_program_purchases/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const commerceDisclosureMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260919200000_add_commerce_disclosure_legal_document/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const disputeStatusMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260919205000_add_program_purchase_dispute_statuses/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const disputeMigration = readFileSync(
  new URL(
    '../prisma/migrations/20260919210000_add_program_purchase_disputes/migration.sql',
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

  it('allows direct purchases without inventing a source enrollment', () => {
    expect(schema).toContain('sourceEnrollmentId        String?');
    expect(directPurchaseMigration).toContain('ALTER COLUMN "source_enrollment_id" DROP NOT NULL');
    expect(directPurchaseMigration).toContain('program_purchases_one_unsettled_direct_product_key');
    expect(directPurchaseMigration).toContain("\"status\" IN ('CREATED', 'CHECKOUT_OPEN', 'PAID')");
  });

  it('supports a versioned commerce disclosure for each service seller', () => {
    expect(commerceDisclosureMigration).toContain(
      `ALTER TYPE "LegalDocumentType" ADD VALUE 'COMMERCE_DISCLOSURE'`,
    );
  });

  it('records reversible disputes separately from refunds', () => {
    expect(schema).toContain('DISPUTED');
    expect(schema).toContain('CHARGEBACK_LOST');
    expect(schema).toContain('disputedAmountYen');
    expect(schema).toContain('enrollmentStatusBeforeDispute');
    expect(disputeStatusMigration).toContain(
      `ALTER TYPE "ProgramPurchaseStatus" ADD VALUE 'DISPUTED'`,
    );
    expect(disputeStatusMigration).toContain(
      `ALTER TYPE "ProgramPurchaseStatus" ADD VALUE 'CHARGEBACK_LOST'`,
    );
    expect(disputeMigration).toContain('program_purchases_disputed_amount_yen_check');
    expect(disputeMigration).toContain('provider_dispute_id');
    expect(disputeMigration).toContain("'CREATED', 'CHECKOUT_OPEN', 'PAID', 'DISPUTED'");
  });
});
