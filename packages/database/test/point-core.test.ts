import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/20260829010000_add_point_core/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('point core migration invariants', () => {
  it('prevents negative balances and invalid transaction signs in the database', () => {
    expect(migration).toContain('point_accounts_nonnegative_check');
    expect(migration).toContain('point_transactions_amount_check');
    expect(migration).toContain('"available_points" >= 0');
  });

  it('makes action processing and ledger writes idempotent', () => {
    expect(migration).toContain('point_transactions_account_id_idempotency_key_key');
    expect(migration).toContain(
      'point_processing_events_workspace_id_event_type_source_event_id_key',
    );
  });

  it('keeps consumption attribution immutable and scoped', () => {
    expect(migration).toContain('point_consumption_links_distinct_check');
    expect(migration).toContain('point_transactions_account_scope_fkey');
    expect(migration).toContain(
      'point_consumption_links_consumption_transaction_id_grant_transaction_id_key',
    );
  });
});
