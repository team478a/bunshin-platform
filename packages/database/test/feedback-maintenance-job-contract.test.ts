import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaJobRepository } from '../src/automation-jobs';
import { platformJob } from '../src/job-mapping';

beforeEach(() =>
  vi.stubGlobal('fetch', () => {
    throw new Error('network forbidden');
  }),
);
afterEach(() => vi.unstubAllGlobals());
describe('Stored maintenance identity mapping', () => {
  it('requires ordinary actor and actorless reserved identity', () => {
    const common = {
      jobType: 'SYNTHETIC_USER_JOB',
      requestedBy: 'synthetic-user',
      bunshinId: null,
      capabilityType: null,
    };
    expect(platformJob(common as never).requestedBy).toBe('synthetic-user');
    const maintenance = { ...common, jobType: 'IMPROVEMENT_FEEDBACK_PURGE', requestedBy: null };
    expect(platformJob(maintenance as never).requestedBy).toBeNull();
    for (const malformed of [
      { ...common, requestedBy: null },
      { ...maintenance, requestedBy: 'synthetic-user' },
      { ...maintenance, bunshinId: 'synthetic-bunshin' },
      { ...maintenance, capabilityType: 'SOCIAL' },
    ])
      expect(() => platformJob(malformed as never)).toThrow();
  });
  it('direct ordinary Repository callers cannot bypass reserved type/missing actor checks', async () => {
    const findFirst = vi.fn();
    const repository = new PrismaJobRepository({ workspace: { findFirst } } as never);
    for (const input of [
      { jobType: 'IMPROVEMENT_FEEDBACK_PURGE', requestedBy: 'synthetic-user' },
      { jobType: 'SYNTHETIC_USER_JOB', requestedBy: '' },
    ])
      await expect(
        repository.enqueue({
          ...input,
          workspaceId: 'synthetic',
          environment: 'STAGING',
          correlationId: 'synthetic',
          idempotencyKey: 'synthetic',
          payloadReference: 'synthetic',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
