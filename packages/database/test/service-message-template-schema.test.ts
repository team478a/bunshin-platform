import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260920210000_add_service_message_templates/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service message template persistence', () => {
  it('keeps templates scoped to one service and does not store recipients or credentials', () => {
    expect(schema).toContain('model ServiceMessageTemplate');
    expect(schema).toContain('ServiceMessageTemplateChannel');
    expect(schema).toContain('ServiceMessageTemplatePurpose');
    expect(migration).toContain('service_message_templates');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toContain('recipient_email');
    expect(migration).not.toContain('api_key');
  });
});
