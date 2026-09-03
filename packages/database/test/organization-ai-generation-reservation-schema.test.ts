import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260903093000_add_organization_ai_generation_reservations/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('organization AI generation reservation persistence', () => {
  it('keeps one idempotent reservation per organization operation', () => {
    expect(schema).toContain('model OrganizationAiGenerationReservation {');
    expect(schema).toContain('@@unique([workspaceId, operationKey])');
    expect(migration).toContain(
      'organization_ai_generation_reservations_workspace_id_operation_key_key',
    );
  });

  it('tracks the month, expiry and terminal outcome without storing prompts', () => {
    for (const column of [
      'month_key',
      'operation_key',
      'status',
      'expires_at',
      'consumed_at',
      'released_at',
    ])
      expect(migration).toContain(`"${column}"`);
    expect(migration).not.toContain('prompt');
    expect(migration).not.toContain('response');
  });
});
