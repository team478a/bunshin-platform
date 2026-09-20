import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260920190000_add_oem_automatic_collection_consent/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('OEM自動回収の同意と支払方法参照', () => {
  it('starts disabled and stores only Stripe references', () => {
    expect(migration).toContain('"automatic_collection_enabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('"automatic_collection_consent_at" TIMESTAMPTZ(6)');
    expect(migration).toContain('"stripe_customer_id" VARCHAR(200)');
    expect(migration).toContain('"stripe_payment_method_id" VARCHAR(200)');
    expect(migration).not.toContain('card_number');
  });
});
