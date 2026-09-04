import { describe, expect, it } from 'vitest';
import { runtimeDatabaseUrl } from '../src/runtime-database-url';

describe('runtimeDatabaseUrl', () => {
  it('adds safe Prisma settings to a transaction pooler URL', () => {
    const result = new URL(
      runtimeDatabaseUrl('postgresql://user:secret@pooler.example.com:6543/postgres')!,
    );
    expect(result.searchParams.get('pgbouncer')).toBe('true');
    expect(result.searchParams.get('connection_limit')).toBe('1');
  });

  it('repairs incorrect transaction pooler settings', () => {
    const result = new URL(
      runtimeDatabaseUrl(
        'postgresql://user:secret@pooler.example.com:6543/postgres?pgbouncer=false&connection_limit=9&schema=public',
      )!,
    );
    expect(result.searchParams.get('pgbouncer')).toBe('true');
    expect(result.searchParams.get('connection_limit')).toBe('1');
    expect(result.searchParams.get('schema')).toBe('public');
  });

  it('does not modify direct or session-pooler URLs', () => {
    const direct = 'postgresql://user:secret@db.example.com:5432/postgres';
    expect(runtimeDatabaseUrl(direct)).toBe(direct);
  });

  it('leaves missing or malformed values for Prisma configuration errors', () => {
    expect(runtimeDatabaseUrl(undefined)).toBeUndefined();
    expect(runtimeDatabaseUrl('not-a-url')).toBe('not-a-url');
  });
});
