import { describe, expect, it } from 'vitest';
import { parseMigrationHistoryStatus } from '../scripts/migration-history-status.mjs';

const known = ['20261014090000_add_line_link_attempt_method'];

describe('migration history status parser', () => {
  it('recognizes an up-to-date database', () => {
    expect(parseMigrationHistoryStatus('Database schema is up to date!', known)).toEqual({
      status: 'UP_TO_DATE',
      pendingMigrations: [],
    });
  });

  it('recognizes only known pending migration names', () => {
    expect(
      parseMigrationHistoryStatus(
        'The following migration(s) have not yet been applied:\n20261014090000_add_line_link_attempt_method\n',
        known,
      ),
    ).toEqual({
      status: 'PENDING',
      pendingMigrations: known,
    });
  });

  it('requires review for failed migration history', () => {
    expect(parseMigrationHistoryStatus('The following migration(s) have failed:', known)).toEqual({
      status: 'NEEDS_REVIEW',
      pendingMigrations: [],
    });
  });

  it('fails closed for unknown output and reports valid pending migration names', () => {
    expect(parseMigrationHistoryStatus('connection succeeded', known).status).toBe('UNKNOWN');
    expect(
      parseMigrationHistoryStatus(
        'The following migration(s) have not yet been applied:\n20261014100000_unknown\n',
        known,
      ),
    ).toEqual({
      status: 'PENDING',
      pendingMigrations: ['20261014100000_unknown'],
    });
  });
});
