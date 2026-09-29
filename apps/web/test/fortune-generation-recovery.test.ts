import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  recover: vi.fn(),
  environment: { APP_ENV: 'production', CRON_SECRET: 'test-cron-secret' },
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('@bunshin/database', () => ({
  prisma: { marker: 'database-client' },
  recoverStaleFortuneReadings: fake.recover,
}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ info: fake.info, error: fake.error }),
  requestIdFromHeader: () => 'request-test',
}));

import {
  fortuneGenerationRecoveryResponse,
  runFortuneGenerationRecovery,
} from '../src/http/fortune-generation-recovery';

function request(secret = 'test-cron-secret') {
  return new Request('https://app.example.com/api/internal/fortune/recover-generating', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe('fortune generation recovery cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.environment.APP_ENV = 'production';
    fake.environment.CRON_SECRET = 'test-cron-secret';
    fake.recover.mockResolvedValue({ candidates: 3, recovered: 2, failed: 1 });
  });

  it('passes a deterministic clock through the public database boundary', async () => {
    const now = new Date('2026-09-28T12:00:00Z');
    await expect(runFortuneGenerationRecovery(now)).resolves.toEqual({
      candidates: 3,
      recovered: 2,
      failed: 1,
    });
    expect(fake.recover).toHaveBeenCalledWith({ marker: 'database-client' }, now);
  });

  it('reports only aggregate recovery counts after authorized production execution', async () => {
    const response = await fortuneGenerationRecoveryResponse(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidates: 3,
      recovered: 2,
      failed: 1,
      requestId: 'request-test',
    });
    expect(fake.info).toHaveBeenCalledWith(
      'fortune interrupted generation recovery complete',
      expect.objectContaining({ candidates: 3, recovered: 2, failed: 1 }),
    );
  });

  it.each(['wrong-secret', ''])(
    'rejects an unauthorized cron without accessing readings',
    async (secret) => {
      const response = await fortuneGenerationRecoveryResponse(request(secret));
      expect(response.status).toBe(401);
      expect(fake.recover).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing authorization header', async () => {
    const response = await fortuneGenerationRecoveryResponse(
      new Request('https://app.example.com'),
    );
    expect(response.status).toBe(401);
    expect(fake.recover).not.toHaveBeenCalled();
  });

  it('does not write in preview or development', async () => {
    fake.environment.APP_ENV = 'preview';
    const response = await fortuneGenerationRecoveryResponse(request());
    expect(await response.json()).toEqual({ mode: 'disabled', requestId: 'request-test' });
    expect(fake.recover).not.toHaveBeenCalled();
  });

  it('fails closed when the cron secret is not configured', async () => {
    fake.environment.CRON_SECRET = '';
    const response = await fortuneGenerationRecoveryResponse(request());
    expect(response.status).toBe(503);
    expect(fake.recover).not.toHaveBeenCalled();
  });

  it('reports persistence failure without logging exception content', async () => {
    fake.recover.mockRejectedValue(new Error('sensitive database message'));
    const response = await fortuneGenerationRecoveryResponse(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(fake.error.mock.calls)).not.toContain('sensitive database message');
  });

  it('wires GET and POST to the protected handler and schedules recovery every five minutes', () => {
    const route = readFileSync(
      fileURLToPath(
        new URL('../app/api/internal/fortune/recover-generating/route.ts', import.meta.url),
      ),
      'utf8',
    );
    const configuration = JSON.parse(
      readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8'),
    ) as { crons: { path: string; schedule: string }[] };
    expect(route).toContain('fortuneGenerationRecoveryResponse(request)');
    expect(route).toContain('export const GET = POST');
    expect(configuration.crons).toContainEqual({
      path: '/api/internal/fortune/recover-generating',
      schedule: '*/5 * * * *',
    });
  });
});
