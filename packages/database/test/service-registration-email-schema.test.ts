import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260920203000_add_oem_registration_email/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('OEM registration email persistence', () => {
  it('stores encrypted credentials separately from delivery content', () => {
    expect(schema).toContain('model ServiceRegistrationEmailConfiguration');
    expect(schema).toContain('encryptedApiKey');
    expect(schema).toContain('model ServiceRegistrationEmailDelivery');
    expect(migration).toContain('service_registration_email_configurations');
    expect(migration).toContain('service_registration_email_deliveries');
    expect(migration).not.toContain('card_number');
  });
});
