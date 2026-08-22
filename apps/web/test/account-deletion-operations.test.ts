/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  accountDeletionOperationsResponse,
  type AccountDeletionBatchPort,
} from '../src/http/account-deletion-operations';

const secret = 'cron-secret-at-least-thirty-two-bytes';
const batch = (): AccountDeletionBatchPort => ({
  dryRun: vi.fn().mockResolvedValue({
    mode: 'dry-run',
    inspected: 4,
    completed: 0,
    blocked: 1,
    retryScheduled: 1,
    infrastructureFailures: 0,
  }),
  execute: vi.fn().mockResolvedValue({
    mode: 'enabled',
    inspected: 1,
    completed: 1,
    blocked: 0,
    retryScheduled: 0,
    infrastructureFailures: 0,
  }),
});

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('CRON_SECRET', secret);
  vi.stubEnv('ACCOUNT_DELETION_EXECUTION_MODE', 'disabled');
});

describe('account deletion operations HTTP boundary', () => {
  it('rejects an invalid Cron secret before constructing a batch', async () => {
    const factory = vi.fn(() => Promise.resolve(batch()));
    const response = await accountDeletionOperationsResponse(
      new Request('http://localhost/api/internal/account-deletions/run'),
      factory,
      factory,
    );
    expect(response.status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not construct or execute a batch while disabled', async () => {
    const factory = vi.fn(() => Promise.resolve(batch()));
    const response = await accountDeletionOperationsResponse(
      new Request('http://localhost', { headers: { authorization: `Bearer ${secret}` } }),
      factory,
      factory,
    );
    await expect(response.json()).resolves.toMatchObject({ mode: 'disabled' });
    expect(factory).not.toHaveBeenCalled();
  });

  it('uses inspection only in dry-run mode', async () => {
    vi.stubEnv('ACCOUNT_DELETION_EXECUTION_MODE', 'dry-run');
    const value = batch();
    const response = await accountDeletionOperationsResponse(
      new Request('http://localhost', { headers: { authorization: `Bearer ${secret}` } }),
      vi.fn(),
      () => Promise.resolve(value),
    );
    expect(response.status).toBe(200);
    expect(value.dryRun).toHaveBeenCalledOnce();
    expect(value.execute).not.toHaveBeenCalled();
  });
});
