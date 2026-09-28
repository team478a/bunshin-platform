import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ preview: vi.fn(), environment: { CRON_SECRET: 'test-secret' } }));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('@bunshin/database', () => ({
  PrismaTrainingRetentionPreviewRepository: class {
    preview = fake.preview;
  },
}));
import { trainingRetentionPreviewResponse } from '../src/http/ai-training-retention-preview';
const scope = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
};
const request = (body: unknown = scope, secret = 'test-secret') =>
  new Request('https://app.example.com/api/internal/ai-training/retention-preview', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('training retention preflight HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.environment.CRON_SECRET = 'test-secret';
    fake.preview.mockResolvedValue({
      outcome: 'PREVIEW',
      summary: { mode: 'DRY_RUN', enrollments: 0 },
    });
  });
  it('requires a secret and forwards only explicit validated scope and a server clock', async () => {
    const response = await trainingRetentionPreviewResponse(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.preview).toHaveBeenCalledWith({ ...scope, now: expect.any(Date) });
    expect(await response.json()).toMatchObject({
      outcome: 'PREVIEW',
      summary: { mode: 'DRY_RUN' },
    });
  });
  it('rejects invalid authentication before reading the scope', async () => {
    expect((await trainingRetentionPreviewResponse(request(scope, 'wrong'))).status).toBe(401);
    expect(fake.preview).not.toHaveBeenCalled();
  });
  it('fails closed without a configured secret', async () => {
    fake.environment.CRON_SECRET = '';
    expect((await trainingRetentionPreviewResponse(request())).status).toBe(503);
    expect(fake.preview).not.toHaveBeenCalled();
  });
  it.each([{}, { ...scope, workspaceId: 'invalid' }, { ...scope, execute: true }])(
    'rejects missing, invalid and execution parameters',
    async (input) => {
      expect((await trainingRetentionPreviewResponse(request(input))).status).toBe(400);
      expect(fake.preview).not.toHaveBeenCalled();
    },
  );
  it('rejects oversized bodies even without Content-Length', async () => {
    expect(
      (await trainingRetentionPreviewResponse(request({ ...scope, extra: 'x'.repeat(600) })))
        .status,
    ).toBe(413);
    expect(fake.preview).not.toHaveBeenCalled();
  });
  it('refuses GET even with valid authentication', async () => {
    const response = await trainingRetentionPreviewResponse(
      new Request('https://app.example.com', { headers: { authorization: 'Bearer test-secret' } }),
    );
    expect(response.status).toBe(405);
    expect(fake.preview).not.toHaveBeenCalled();
  });
  it('does not convert a truncated preview into success', async () => {
    fake.preview.mockResolvedValue({ outcome: 'TOO_LARGE' });
    expect((await trainingRetentionPreviewResponse(request())).status).toBe(413);
  });
  it('returns a safe failure without private exception content', async () => {
    fake.preview.mockRejectedValue(new Error('private work context'));
    const response = await trainingRetentionPreviewResponse(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private work context');
  });
});
