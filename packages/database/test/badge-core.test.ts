import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../prisma/migrations/20260829050000_add_badge_core/migration.sql', import.meta.url),
  ),
  'utf8',
);

describe('badge core migration invariants', () => {
  it('enforces system and group ownership without cross-scope definitions', () => {
    expect(migration).toContain('badge_definitions_owner_scope_check');
    expect(migration).toContain('badge_definitions_owner_scope_key');
    expect(migration).toContain('badge_definitions_group_scope_fkey');
  });

  it('keeps versions and historical awards immutable by reference', () => {
    expect(migration).toContain('badge_versions_definition_id_version_key');
    expect(migration).toContain('badge_awards_badge_version_id_fkey');
    expect(migration).toContain('badge_awards_evidence_hash_check');
  });

  it('makes event processing and awards idempotent per workspace user', () => {
    expect(migration).toContain(
      'badge_processing_events_workspace_id_event_type_source_event_id_key',
    );
    expect(migration).toContain('badge_awards_workspace_id_user_id_idempotency_key_key');
    expect(migration).toContain('badge_awards_workspace_id_user_id_badge_version_id_key');
  });

  it('prevents cross-workspace group and bunshin attribution', () => {
    expect(migration).toContain('badge_progress_group_scope_fkey');
    expect(migration).toContain('badge_awards_group_scope_fkey');
    expect(migration).toContain('badge_awards_source_bunshin_scope_fkey');
  });
});
