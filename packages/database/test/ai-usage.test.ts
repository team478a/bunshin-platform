import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaAiUsageEventRepository } from '../src';

const input = {
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
  occurredAt: new Date('2026-08-21T00:00:00Z'),
};

describe('PrismaAiUsageEventRepository', () => {
  it('requires an active membership in the same workspace and Bunshin', async () => {
    const upsert = vi.fn();
    const client = {
      bunshin: { findFirst: vi.fn().mockResolvedValue(null) },
      aiUsageEvent: { upsert },
    } as unknown as PrismaClient;
    await expect(new PrismaAiUsageEventRepository(client).record(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('uses the request key to make recording idempotent', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'event-1' });
    const client = {
      bunshin: { findFirst: vi.fn().mockResolvedValue({ id: input.bunshinId }) },
      aiUsageEvent: { upsert },
    } as unknown as PrismaClient;
    await new PrismaAiUsageEventRepository(client).record(input);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_actorUserId_idempotencyKey: {
            workspaceId: input.workspaceId,
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        update: {},
      }),
    );
  });
});
