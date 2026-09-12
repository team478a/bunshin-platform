import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync(
  'prisma/migrations/20260912170000_weekly_report_line_delivery/migration.sql',
  'utf8',
);

describe('weekly report LINE delivery persistence', () => {
  it('stores one automated broadcast per service week and a private recipient message', () => {
    expect(schema).toContain('automationKey   String?');
    expect(schema).toContain('message           String?');
    expect(migration).toContain('service_line_broadcasts_automation_key_key');
    expect(migration).toContain('service_line_broadcast_recipients');
  });
});
