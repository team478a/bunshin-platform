import { describe, expect, it, vi } from 'vitest';
import {
  integrationDatabaseTarget,
  verifyIntegrationDatabase,
  type IntegrationDatabaseIdentity,
} from './integration-database-preflight';

const runId = '7369ba7c0098';
const database = `bunshin_disposable_${runId}`;
const url = `postgresql://postgres:synthetic-local-test-only@127.0.0.1:18998/${database}`;
const local = {
  NODE_ENV: 'test',
  APP_ENV: 'development',
  DATABASE_URL: url,
  DIRECT_URL: url,
  BUNSHIN_TEST_RUN_ID: runId,
};
const ciUrl = 'postgresql://postgres:postgres@localhost:5432/bunshin_platform_test';
const ci = {
  NODE_ENV: 'test',
  APP_ENV: 'development',
  DATABASE_URL: ciUrl,
  DIRECT_URL: ciUrl,
  GITHUB_ACTIONS: 'true',
  CI: 'true',
  GITHUB_REPOSITORY: 'team478a/bunshin-platform',
  GITHUB_RUN_ID: '123456789',
  GITHUB_RUN_ATTEMPT: '1',
};

describe('integration database preflight safety regression', () => {
  it('accepts only explicit disposable local scope and matching live marker', async () => {
    const target = integrationDatabaseTarget(local);
    expect(target).toEqual({
      database,
      marker: `bunshin-disposable-test:${runId}`,
      mode: 'LOCAL_DISPOSABLE',
    });
    await expect(
      verifyIntegrationDatabase(target, () =>
        Promise.resolve([{ database, marker: target.marker }]),
      ),
    ).resolves.toBeUndefined();
  });

  it('preserves the unchanged GitHub service configuration, not arbitrary CI targets', async () => {
    const target = integrationDatabaseTarget(ci);
    expect(target.mode).toBe('GITHUB_SERVICE');
    await expect(
      verifyIntegrationDatabase(target, () =>
        Promise.resolve([{ database: 'bunshin_platform_test', marker: null }]),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['production', { APP_ENV: 'production' }],
    ['staging', { APP_ENV: 'staging' }],
    ['missing application environment', { APP_ENV: undefined }],
    ['non-test runtime', { NODE_ENV: 'development' }],
    ['missing URL', { DATABASE_URL: undefined }],
    ['missing direct URL', { DIRECT_URL: undefined }],
    ['direct target mismatch', { DIRECT_URL: ciUrl }],
    ['missing run marker', { BUNSHIN_TEST_RUN_ID: undefined }],
    ['invalid run marker', { BUNSHIN_TEST_RUN_ID: '../test' }],
    ['unapproved CI flag', { CI: 'true' }],
    ['unapproved GitHub flag', { GITHUB_ACTIONS: 'false' }],
  ])('rejects %s before any connection', (_name, changes) => {
    expect(() => integrationDatabaseTarget({ ...local, ...changes })).toThrow('preflight refused');
  });

  it.each([
    url.replace('127.0.0.1', 'test.example.com'),
    url.replace('127.0.0.1', '127.0.0.1.example.com'),
    url.replace('127.0.0.1', 'localhost'),
    url.replace('18998', '5432'),
    url.replace(database, 'production_test'),
    url.replace(database, 'bunshin_disposable_ffffffffffff'),
    url.replace('postgresql:', 'https:'),
    url.replace('postgres:', 'owner:'),
    url.replace('synthetic-local-test-only', 'short'),
    `${url}?host=production.example.com`,
    `${url}#test`,
    url.replace(database, `%62${database.slice(1)}`),
    'not a database URL',
  ])('rejects lookalike and redirected targets without exposing the URL', (candidate) => {
    let message = '';
    try {
      integrationDatabaseTarget({ ...local, DATABASE_URL: candidate, DIRECT_URL: candidate });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('preflight refused');
    expect(message).not.toContain(candidate);
    expect(message).not.toContain('synthetic-local-test-only');
  });

  it.each([
    { GITHUB_RUN_ID: undefined },
    { GITHUB_RUN_ATTEMPT: '0' },
    { GITHUB_REPOSITORY: 'someone/another-project' },
    { CI: undefined },
    { DATABASE_URL: url, DIRECT_URL: url },
  ])('rejects incomplete or foreign CI context', (changes) => {
    expect(() => integrationDatabaseTarget({ ...ci, ...changes })).toThrow('preflight refused');
  });

  it.each<IntegrationDatabaseIdentity[]>([
    [],
    [{ database, marker: null }],
    [{ database, marker: 'bunshin-disposable-test:ffffffffffff' }],
    [{ database: 'production', marker: `bunshin-disposable-test:${runId}` }],
    [
      { database, marker: `bunshin-disposable-test:${runId}` },
      { database, marker: null },
    ],
  ])('refuses mismatched live DB identity before proceeding', async (...identities) => {
    const cleanup = vi.fn();
    const run = async () => {
      await verifyIntegrationDatabase(integrationDatabaseTarget(local), () =>
        Promise.resolve(identities),
      );
      cleanup();
    };
    await expect(run()).rejects.toThrow('preflight refused');
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('sanitizes failed identity probes and never proceeds to cleanup', async () => {
    const cleanup = vi.fn();
    const run = async () => {
      await verifyIntegrationDatabase(integrationDatabaseTarget(local), () =>
        Promise.reject(new Error(`driver secret: ${url}`)),
      );
      cleanup();
    };
    await expect(run()).rejects.toThrow(
      'Integration database preflight refused: use an isolated disposable test database',
    );
    expect(cleanup).not.toHaveBeenCalled();
  });
});
