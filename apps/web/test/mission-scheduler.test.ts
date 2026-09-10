/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { missionSchedulerResponse, type MissionSchedulerPort } from '../src/http/mission-scheduler';

const secret = 'cron-secret-at-least-thirty-two-bytes';
const scheduler = (): MissionSchedulerPort => ({
  execute: vi.fn((environment) =>
    Promise.resolve({
      environment,
      candidates: 3,
      due: 1,
      weeklyEnqueued: 0,
      dailyEnqueued: 1,
      skipped: 0,
      failures: 0,
      truncated: false,
    }),
  ),
});

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  vi.stubEnv('DIRECT_URL', 'postgres://test');
  vi.stubEnv('SESSION_SECRET', 'session-secret-at-least-thirty-two-bytes');
  vi.stubEnv('CRON_SECRET', secret);
});

describe('mission scheduler HTTP boundary', () => {
  it('rejects missing and incorrect secrets before constructing the scheduler', async () => {
    const factory = vi.fn(() => Promise.resolve(scheduler()));
    expect((await missionSchedulerResponse(new Request('http://localhost'), factory)).status).toBe(
      401,
    );
    expect(
      (
        await missionSchedulerResponse(
          new Request('http://localhost', { headers: { authorization: 'Bearer wrong' } }),
          factory,
        )
      ).status,
    ).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });

  it('derives the Job environment only from server configuration', async () => {
    const value = scheduler();
    const response = await missionSchedulerResponse(
      new Request('http://localhost?environment=PRODUCTION', {
        headers: { authorization: `Bearer ${secret}` },
      }),
      () => Promise.resolve(value),
    );
    expect(response.status).toBe(200);
    expect(value.execute).toHaveBeenCalledWith('DEVELOPMENT');
    await expect(response.json()).resolves.toMatchObject({ dailyEnqueued: 1 });
  });

  it('allows the scheduler result to report point and badge processing', async () => {
    const value: MissionSchedulerPort = {
      execute: vi.fn(() =>
        Promise.resolve({
          environment: 'DEVELOPMENT' as const,
          candidates: 0,
          due: 0,
          weeklyEnqueued: 0,
          dailyEnqueued: 0,
          skipped: 0,
          failures: 0,
          truncated: false,
          incentives: {
            points: {
              scanned: 1,
              GRANTED: 1,
              ALREADY_PROCESSED: 0,
              NO_ACTIVE_RULE: 0,
              NOT_ELIGIBLE: 0,
              failures: 0,
            },
            badges: {
              scanned: 1,
              AWARDED: 1,
              PROGRESSED: 0,
              ALREADY_PROCESSED: 0,
              NO_ACTIVE_BADGE: 0,
              NOT_ELIGIBLE: 0,
              failures: 0,
            },
          },
        }),
      ),
    };
    const response = await missionSchedulerResponse(
      new Request('http://localhost', { headers: { authorization: `Bearer ${secret}` } }),
      () => Promise.resolve(value),
    );
    await expect(response.json()).resolves.toMatchObject({
      incentives: { points: { GRANTED: 1 }, badges: { AWARDED: 1 } },
    });
  });
});
