import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertUserJob,
  EnqueueJob,
  ExecuteMissionAutomationJob,
  ExecuteFortuneGenerationJob,
  ExecuteLineDeliveryJob,
  FEEDBACK_PURGE_JOB_TYPE,
  type Job,
} from '../src';

beforeEach(() =>
  vi.stubGlobal('fetch', () => {
    throw new Error('network forbidden');
  }),
);
afterEach(() => vi.unstubAllGlobals());
describe('Feedback maintenance actor contract', () => {
  it('rejects reserved type and missing actor before public enqueue touches repository', async () => {
    const enqueue = vi.fn();
    const service = new EnqueueJob({ enqueue } as never);
    for (const input of [
      { jobType: FEEDBACK_PURGE_JOB_TYPE, requestedBy: 'synthetic-user' },
      { jobType: 'SYNTHETIC_USER_JOB', requestedBy: '' },
    ])
      await expect(
        service.enqueue({
          ...input,
          workspaceId: 'synthetic',
          environment: 'STAGING',
          correlationId: 'synthetic',
          idempotencyKey: 'synthetic',
          payloadReference: 'synthetic',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(enqueue).not.toHaveBeenCalled();
  });
  it('allows ordinary actor but rejects actorless and actorful reserved jobs', () => {
    const ordinary = { jobType: 'SYNTHETIC_USER_JOB', requestedBy: 'synthetic-user' } as Job;
    expect(() => assertUserJob(ordinary)).not.toThrow();
    for (const bad of [
      { jobType: FEEDBACK_PURGE_JOB_TYPE, requestedBy: null },
      { jobType: FEEDBACK_PURGE_JOB_TYPE, requestedBy: 'synthetic-user' },
      { jobType: 'SYNTHETIC_USER_JOB', requestedBy: null },
    ])
      expect(() => assertUserJob(bad as Job)).toThrow();
  });
  it('rejects maintenance before ordinary Mission/Fortune/LINE executors invoke any dependency', async () => {
    const dependency = { execute: vi.fn(), validateWeekly: vi.fn(), get: vi.fn() };
    const job = {
      requestedBy: null,
      jobType: FEEDBACK_PURGE_JOB_TYPE,
      bunshinId: null,
      capabilityType: null,
    } as Job;
    const executors = [
      new ExecuteMissionAutomationJob(
        dependency as never,
        dependency as never,
        dependency as never,
        dependency as never,
      ),
      new ExecuteFortuneGenerationJob(
        dependency as never,
        dependency as never,
        dependency as never,
      ),
      new ExecuteLineDeliveryJob(dependency as never, dependency as never, dependency as never),
    ];
    for (const executor of executors)
      await expect(executor.execute(job, 'synthetic-worker')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    expect(dependency.execute).not.toHaveBeenCalled();
    expect(dependency.validateWeekly).not.toHaveBeenCalled();
    expect(dependency.get).not.toHaveBeenCalled();
  });
});
