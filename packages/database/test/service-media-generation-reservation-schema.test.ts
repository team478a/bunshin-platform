import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../prisma/migrations/20260907190000_add_service_media_generation_reservations/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('service media generation reservation schema', () => {
  it('stores an idempotent, service-scoped monthly reservation ledger', () => {
    expect(schema).toContain('model ServiceMediaGenerationReservation');
    expect(schema).toContain('map: "service_media_reservation_operation_key"');
    expect(schema).toContain('map: "service_media_reservation_month_status_idx"');
    expect(migration).toContain('CREATE TYPE "ServiceMediaGenerationKind"');
    expect(migration).toContain('DEFAULT gen_random_uuid()');
    expect(migration).toContain('FOREIGN KEY ("workspace_id", "group_id")');
  });
});
