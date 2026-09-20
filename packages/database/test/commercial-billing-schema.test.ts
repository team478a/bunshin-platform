import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260918170000_add_oem_contract_invoicing',
    'migration.sql',
  ),
  'utf8',
);
const checkoutMigration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260919230000_add_oem_invoice_checkout',
    'migration.sql',
  ),
  'utf8',
);
const reminderMigration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260920010000_add_commercial_billing_reminders',
    'migration.sql',
  ),
  'utf8',
);
const documentMigration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260920090000_add_tenant_invoice_document_snapshot',
    'migration.sql',
  ),
  'utf8',
);

describe('OEM contract and invoice schema', () => {
  it('binds one invoice to one tenant monthly usage snapshot', () => {
    expect(schema).toContain('model OrganizationCommercialContract');
    expect(schema).toContain('model TenantInvoice');
    expect(schema).toContain('monthlyUsageId           String');
    expect(migration).toContain('CREATE UNIQUE INDEX "tenant_invoices_monthly_usage_id_key"');
  });

  it('uses tenant-scoped foreign keys and keeps billing mutations auditable', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "contract_id") REFERENCES "organization_commercial_contracts"("workspace_id", "id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("workspace_id", "monthly_usage_id") REFERENCES "tenant_monthly_usage"("workspace_id", "id")',
    );
    expect(migration).toContain('CREATE TABLE "commercial_billing_audits"');
    expect(migration).toContain('ALTER TABLE "tenant_invoices" ENABLE ROW LEVEL SECURITY');
  });

  it('enforces payment terms, non-negative charges, and lifecycle timestamps', () => {
    expect(migration).toContain('"payment_terms_days" BETWEEN 0 AND 365');
    expect(migration).toContain('"amount_yen" >= 0');
    expect(migration).toContain('tenant_invoices_status_timestamps');
  });

  it('tracks hosted payment identity and deduplicates platform billing webhooks', () => {
    expect(schema).toContain('model CommercialBillingWebhookEvent');
    expect(schema).toContain('providerCheckoutSessionId String?');
    expect(checkoutMigration).toContain('commercial_billing_webhook_events');
    expect(checkoutMigration).toContain('commercial_billing_webhook_events_provider_event_id_key');
    expect(checkoutMigration).toContain(
      'FOREIGN KEY ("workspace_id", "invoice_id") REFERENCES "tenant_invoices"',
    );
  });

  it('keeps automatic reminders disabled until an operator opts in', () => {
    expect(schema).toContain('automaticRemindersEnabled Boolean');
    expect(reminderMigration).toContain(
      '"automatic_reminders_enabled" BOOLEAN NOT NULL DEFAULT false',
    );
  });

  it('stores immutable invoice document facts on the tenant invoice', () => {
    expect(schema).toContain('documentSnapshot         Json?');
    expect(documentMigration).toContain('ADD COLUMN "document_snapshot" JSONB');
  });
});
