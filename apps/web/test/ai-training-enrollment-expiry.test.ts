import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  expire: vi.fn(),
  environment: { APP_ENV: 'development', CRON_SECRET: 'test-cron-secret' },
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('@bunshin/database', () => ({
  prisma: { marker: 'db' },
  expireUnpurchasedTrainingEnrollments: fake.expire,
}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ info: fake.info, error: fake.error }),
  requestIdFromHeader: () => 'request-test',
}));
import {
  trainingEnrollmentExpiryResponse,
  runTrainingEnrollmentExpiry,
} from '../src/http/ai-training-enrollment-expiry';

const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
};
const query = new URLSearchParams(scope).toString();
function request(params = query, method = 'POST', secret = 'test-cron-secret', body?: string) {
  return new Request(
    `https://app.example.com/api/internal/ai-training/expire-enrollments?${params}`,
    {
      method,
      headers: { authorization: `Bearer ${secret}` },
      ...(body ? { body } : {}),
    },
  );
}

describe('training enrollment expiry execution boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.environment.APP_ENV = 'development';
    fake.environment.CRON_SECRET = 'test-cron-secret';
    fake.expire.mockResolvedValue({
      candidates: 2,
      expired: 1,
      skipped: 0,
      conflicts: 1,
      hasMore: false,
    });
  });
  it('passes an explicit scope and internal clock through the public database export', async () => {
    const now = new Date('2026-09-29T00:00:00Z');
    await runTrainingEnrollmentExpiry(scope, now);
    expect(fake.expire).toHaveBeenCalledWith({ marker: 'db' }, { ...scope, now });
  });
  it.each(['development', 'staging'])(
    'executes only authorized scoped batches in %s',
    async (environment) => {
      fake.environment.APP_ENV = environment;
      const response = await trainingEnrollmentExpiryResponse(request());
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual({
        data: { candidates: 2, expired: 1, skipped: 0, conflicts: 1, hasMore: false },
        requestId: 'request-test',
      });
      expect(fake.expire).toHaveBeenCalledWith(
        { marker: 'db' },
        { ...scope, now: expect.any(Date) },
      );
      expect(JSON.stringify(fake.info.mock.calls)).not.toContain(scope.workspaceId);
    },
  );
  it.each(['production', 'preview', 'test', 'unknown'])(
    'fails closed without writes in %s',
    async (environment) => {
      fake.environment.APP_ENV = environment;
      const response = await trainingEnrollmentExpiryResponse(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ mode: 'DISABLED' });
      expect(fake.expire).not.toHaveBeenCalled();
    },
  );
  it.each(['', 'wrong-secret'])('requires valid bearer authorization', async (secret) => {
    expect((await trainingEnrollmentExpiryResponse(request(query, 'POST', secret))).status).toBe(
      401,
    );
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it('requires an authorization header even for a disabled production endpoint', async () => {
    fake.environment.APP_ENV = 'production';
    expect(
      (
        await trainingEnrollmentExpiryResponse(
          new Request('https://app.example.com', { method: 'POST' }),
        )
      ).status,
    ).toBe(401);
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it('fails closed if the cron secret is not configured', async () => {
    fake.environment.CRON_SECRET = '';
    expect((await trainingEnrollmentExpiryResponse(request())).status).toBe(503);
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it('rejects GET without running a batch', async () => {
    const response = await trainingEnrollmentExpiryResponse(request(query, 'GET'));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it.each([
    '',
    'workspaceId=invalid&groupId=invalid',
    `${query}&groupId=${scope.groupId}`,
    `${query}&now=2030-01-01`,
    `${query}&userId=another`,
  ])('rejects missing/invalid/duplicate/unknown scope input: %s', async (params) => {
    expect((await trainingEnrollmentExpiryResponse(request(params))).status).toBe(400);
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it('rejects a body instead of accepting an alternate scope or clock', async () => {
    expect(
      (await trainingEnrollmentExpiryResponse(request(query, 'POST', 'test-cron-secret', '{}')))
        .status,
    ).toBe(400);
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it('bounds the query length before scope processing', async () => {
    expect(
      (await trainingEnrollmentExpiryResponse(request(`extra=${'x'.repeat(1024)}`))).status,
    ).toBe(413);
    expect(fake.expire).not.toHaveBeenCalled();
  });
  it('reports failures without raw errors or personal details', async () => {
    fake.expire.mockRejectedValue(new Error('private database details'));
    const response = await trainingEnrollmentExpiryResponse(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database details');
    expect(JSON.stringify(fake.error.mock.calls)).not.toContain('private database details');
  });
  it('wires POST only and does not register a production scheduler', () => {
    const route = readFileSync(
      new URL('../app/api/internal/ai-training/expire-enrollments/route.ts', import.meta.url),
      'utf8',
    );
    expect(route).toContain('trainingEnrollmentExpiryResponse(request)');
    expect(route).toContain('export async function POST');
    expect(route).not.toContain('export const GET');
    expect(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).not.toContain(
      '/api/internal/ai-training/expire-enrollments',
    );
  });
});
