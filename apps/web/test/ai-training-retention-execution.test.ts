import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  preview: vi.fn(),
  execute: vi.fn(),
  actor: vi.fn(),
  origin: vi.fn(),
  environment: { APP_ENV: 'staging' },
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: fake.origin }));
vi.mock('@bunshin/database', () => ({
  PrismaTrainingRetentionExecutionRepository: class {
    preview = fake.preview;
    execute = fake.execute;
  },
}));
import { ApplicationError } from '@bunshin/shared';
import { trainingRetentionExecutionResponse } from '../src/http/ai-training-retention-execution';
const scope = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  programEnrollmentId: '33333333-3333-4333-8333-333333333333',
};
const execution = {
  ...scope,
  action: 'execute',
  revision: 'a'.repeat(64),
  confirmation: 'APPLY_TRAINING_RETENTION',
};
const request = (body: unknown) =>
  new Request('https://app.example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
    body: JSON.stringify(body),
  });
describe('training retention execution HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.actor.mockResolvedValue({ userId: 'admin' });
    fake.environment.APP_ENV = 'staging';
    fake.origin.mockImplementation(() => {});
    fake.preview.mockResolvedValue({ outcome: 'PREVIEW' });
    fake.execute.mockResolvedValue({ outcome: 'APPLIED' });
  });
  it('requires explicit scope and confirmation, using only the authenticated operator', async () => {
    const response = await trainingRetentionExecutionResponse(request(execution));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.execute).toHaveBeenCalledWith({
      ...scope,
      operatorUserId: 'admin',
      now: expect.any(Date),
      revision: 'a'.repeat(64),
    });
  });
  it.each(['production', 'preview', 'unknown'])(
    'keeps execution disabled in %s',
    async (environment) => {
      fake.environment.APP_ENV = environment;
      expect((await trainingRetentionExecutionResponse(request(execution))).status).toBe(503);
      expect(fake.execute).not.toHaveBeenCalled();
    },
  );
  it('permits a read-only preview in production', async () => {
    fake.environment.APP_ENV = 'production';
    expect(
      (await trainingRetentionExecutionResponse(request({ ...scope, action: 'preview' }))).status,
    ).toBe(200);
    expect(fake.execute).not.toHaveBeenCalled();
  });
  it('rejects missing sessions and cross-origin requests', async () => {
    fake.actor.mockResolvedValue(null);
    expect((await trainingRetentionExecutionResponse(request(execution))).status).toBe(401);
    fake.actor.mockResolvedValue({ userId: 'admin' });
    fake.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin rejected');
    });
    expect((await trainingRetentionExecutionResponse(request(execution))).status).toBe(403);
    expect(fake.execute).not.toHaveBeenCalled();
  });
  it.each([
    { ...execution, confirmation: 'wrong' },
    { ...execution, operatorUserId: 'forged' },
    { ...execution, revision: 'invalid' },
  ])('rejects forged or incomplete confirmations', async (body) => {
    expect((await trainingRetentionExecutionResponse(request(body))).status).toBe(400);
    expect(fake.execute).not.toHaveBeenCalled();
  });
  it.each([
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['TOO_LARGE', 413],
  ] as const)('maps %s safely', async (outcome, status) => {
    fake.execute.mockResolvedValue({ outcome });
    expect((await trainingRetentionExecutionResponse(request(execution))).status).toBe(status);
  });
  it('rejects oversized payloads and keeps exceptions private', async () => {
    expect(
      (await trainingRetentionExecutionResponse(request({ ...execution, extra: 'x'.repeat(1100) })))
        .status,
    ).toBe(413);
    fake.execute.mockRejectedValue(new Error('private answer text'));
    const response = await trainingRetentionExecutionResponse(request(execution));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private answer text');
  });
});
