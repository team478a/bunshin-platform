import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  run: vi.fn(),
  environment: { APP_ENV: 'production', CRON_SECRET: 'c'.repeat(32) },
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('@bunshin/database', () => ({
  PrismaTrainingRetentionCronRepository: class {
    run = fake.run;
  },
}));

import { trainingRetentionCronResponse } from '../src/http/ai-training-retention-cron';

const scopes = [
  {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    groupId: '22222222-2222-4222-8222-222222222222',
    serviceProgramId: '33333333-3333-4333-8333-333333333333',
  },
];
const secret = 'c'.repeat(32);
const request = (authorization = `Bearer ${secret}`) =>
  new Request('https://app.example.com/api/internal/ai-training/retention-cron', {
    headers: { authorization },
  });

describe('AI training retention Cron HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('PERSONAL_LEARNING_RETENTION_SCOPES', '');
    vi.stubEnv('PERSONAL_LEARNING_RETENTION_OPERATOR_USER_ID', '');
    vi.stubEnv('PERSONAL_LEARNING_RETENTION_EXECUTION_ENABLED', '');
    fake.environment.APP_ENV = 'production';
    fake.environment.CRON_SECRET = secret;
    fake.run.mockResolvedValue({ outcome: 'PREVIEW', enrollments: 1, counts: {} });
  });

  it('requires Cron authentication before reading settings or invoking the repository', async () => {
    expect((await trainingRetentionCronResponse(request('Bearer wrong'))).status).toBe(401);
    expect(fake.run).not.toHaveBeenCalled();
  });

  it('does nothing when explicit Program scopes are not configured', async () => {
    const response = await trainingRetentionCronResponse(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: 'NOT_CONFIGURED', mode: 'PREVIEW' });
    expect(fake.run).not.toHaveBeenCalled();
  });

  it('defaults to count-only preview and passes only explicitly configured Program scopes', async () => {
    vi.stubEnv('PERSONAL_LEARNING_RETENTION_SCOPES', JSON.stringify(scopes));
    vi.stubEnv(
      'PERSONAL_LEARNING_RETENTION_OPERATOR_USER_ID',
      '44444444-4444-4444-8444-444444444444',
    );
    const response = await trainingRetentionCronResponse(request());
    expect(response.status).toBe(200);
    expect(fake.run).toHaveBeenCalledWith({
      scopes,
      operatorUserId: '44444444-4444-4444-8444-444444444444',
      now: expect.any(Date),
      executeEnabled: false,
    });
  });

  it('only enables deletion when both production and the exact opt-in setting are present', async () => {
    vi.stubEnv('PERSONAL_LEARNING_RETENTION_SCOPES', JSON.stringify(scopes));
    vi.stubEnv(
      'PERSONAL_LEARNING_RETENTION_OPERATOR_USER_ID',
      '44444444-4444-4444-8444-444444444444',
    );
    vi.stubEnv('PERSONAL_LEARNING_RETENTION_EXECUTION_ENABLED', 'true');
    fake.environment.APP_ENV = 'staging';
    await trainingRetentionCronResponse(request());
    expect(fake.run).toHaveBeenLastCalledWith(expect.objectContaining({ executeEnabled: false }));

    fake.environment.APP_ENV = 'production';
    await trainingRetentionCronResponse(request());
    expect(fake.run).toHaveBeenLastCalledWith(expect.objectContaining({ executeEnabled: true }));
  });

  it('rejects malformed or duplicate scope configuration without calling the repository', async () => {
    vi.stubEnv('PERSONAL_LEARNING_RETENTION_SCOPES', JSON.stringify([...scopes, ...scopes]));
    vi.stubEnv(
      'PERSONAL_LEARNING_RETENTION_OPERATOR_USER_ID',
      '44444444-4444-4444-8444-444444444444',
    );
    expect((await trainingRetentionCronResponse(request())).status).toBe(503);
    expect(fake.run).not.toHaveBeenCalled();
  });
});
