import { describe, expect, it, vi } from 'vitest';
import { RecordAiUsage, type AiUsageEventRepository } from '../src';

const valid = {
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  taskType: 'CONTENT_GENERATOR',
  provider: 'openai',
  model: 'gpt-test',
  promptVersion: 'content-v1',
  status: 'SUCCESS' as const,
  inputTokens: 100,
  outputTokens: 25,
  latencyMs: 500,
  idempotencyKey: 'request-1:content',
};

describe('RecordAiUsage', () => {
  it('records non-sensitive provider measurements', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const repository: AiUsageEventRepository = { record };
    await new RecordAiUsage(repository).execute(valid);
    expect(record).toHaveBeenCalledWith(valid);
  });

  it('rejects negative measurements and invalid success errors', async () => {
    const repository: AiUsageEventRepository = { record: vi.fn() };
    await expect(
      new RecordAiUsage(repository).execute({ ...valid, inputTokens: -1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      new RecordAiUsage(repository).execute({ ...valid, errorCode: 'PROVIDER_ERROR' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
