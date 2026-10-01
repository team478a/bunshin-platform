import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  preview: vi.fn(),
  environment: { APP_ENV: 'production', CRON_SECRET: 'test-cron-secret' },
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('@bunshin/database', () => ({
  prisma: { marker: 'db' },
  previewUnpurchasedTrainingEnrollmentExpiry: fake.preview,
}));
vi.mock('@bunshin/observability', () => ({
  createLogger: () => ({ info: fake.info, error: fake.error }),
  requestIdFromHeader: () => 'request-test',
}));
import {
  runTrainingEnrollmentExpiryPreview,
  trainingEnrollmentExpiryPreviewResponse,
} from '../src/http/ai-training-enrollment-expiry-preview';

const scope = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  groupId: '00000000-0000-4000-8000-000000000002',
};
const query = new URLSearchParams(scope).toString();
function request(params = query, method = 'POST', secret = 'test-cron-secret', body?: string) {
  return new Request(
    `https://app.example.com/api/internal/ai-training/enrollment-expiry-preview?${params}`,
    {
      method,
      headers: { authorization: `Bearer ${secret}` },
      ...(body !== undefined ? { body } : {}),
    },
  );
}

describe('training enrollment expiry preview boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.environment.APP_ENV = 'production';
    fake.environment.CRON_SECRET = 'test-cron-secret';
    fake.preview.mockResolvedValue({
      eligible: 201,
      batchLimit: 100,
      requiredBatches: 3,
      hasMore: true,
      cutoffAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('passes only the explicit scope and server clock to the read-only database export', async () => {
    const now = new Date('2026-10-01T00:00:00.000Z');
    await runTrainingEnrollmentExpiryPreview(scope, now);
    expect(fake.preview).toHaveBeenCalledWith({ marker: 'db' }, { ...scope, now });
  });

  it.each(['production', 'staging', 'development'])(
    'allows an authorized read-only preview in %s',
    async (environment) => {
      fake.environment.APP_ENV = environment;
      const response = await trainingEnrollmentExpiryPreviewResponse(request());
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toMatchObject({
        data: { eligible: 201, requiredBatches: 3, hasMore: true },
        requestId: 'request-test',
      });
      expect(fake.preview).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(fake.info.mock.calls)).not.toContain(scope.workspaceId);
    },
  );

  it.each(['', 'wrong-secret'])('requires valid bearer authorization', async (secret) => {
    expect(
      (await trainingEnrollmentExpiryPreviewResponse(request(query, 'POST', secret))).status,
    ).toBe(401);
    expect(fake.preview).not.toHaveBeenCalled();
  });

  it('fails closed if the cron secret is not configured', async () => {
    fake.environment.CRON_SECRET = '';
    expect((await trainingEnrollmentExpiryPreviewResponse(request())).status).toBe(503);
    expect(fake.preview).not.toHaveBeenCalled();
  });

  it('rejects GET and never reads the preview', async () => {
    const response = await trainingEnrollmentExpiryPreviewResponse(request(query, 'GET'));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(fake.preview).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'workspaceId=invalid&groupId=invalid',
    `${query}&groupId=${scope.groupId}`,
    `${query}&now=2030-01-01`,
    `${query}&userId=another`,
  ])('rejects missing, invalid, duplicate or unknown scope input: %s', async (params) => {
    expect((await trainingEnrollmentExpiryPreviewResponse(request(params))).status).toBe(400);
    expect(fake.preview).not.toHaveBeenCalled();
  });

  it('rejects a non-empty body and accepts an explicitly empty stream', async () => {
    expect(
      (
        await trainingEnrollmentExpiryPreviewResponse(
          request(query, 'POST', 'test-cron-secret', '{}'),
        )
      ).status,
    ).toBe(400);
    expect(fake.preview).not.toHaveBeenCalled();

    const empty = request(query, 'POST', 'test-cron-secret', '');
    expect(empty.body).not.toBeNull();
    expect((await trainingEnrollmentExpiryPreviewResponse(empty)).status).toBe(200);
    expect(fake.preview).toHaveBeenCalledTimes(1);
  });

  it('bounds query size and redacts errors and scope from logs', async () => {
    expect(
      (await trainingEnrollmentExpiryPreviewResponse(request(`extra=${'x'.repeat(1024)}`))).status,
    ).toBe(413);
    fake.preview.mockRejectedValue(new Error('private database details'));
    const response = await trainingEnrollmentExpiryPreviewResponse(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database details');
    expect(JSON.stringify(fake.error.mock.calls)).not.toContain('private database details');
    expect(JSON.stringify(fake.error.mock.calls)).not.toContain(scope.workspaceId);
  });

  it('wires POST only and does not register a production scheduler', () => {
    const route = readFileSync(
      new URL(
        '../app/api/internal/ai-training/enrollment-expiry-preview/route.ts',
        import.meta.url,
      ),
      'utf8',
    );
    expect(route).toContain('trainingEnrollmentExpiryPreviewResponse');
    expect(route).toContain('export async function POST');
    expect(route).not.toContain('export const GET');
    expect(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).not.toContain(
      '/api/internal/ai-training/enrollment-expiry-preview',
    );
  });
});
