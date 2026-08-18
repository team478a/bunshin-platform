import { describe, expect, it, vi } from 'vitest';
import type { BunshinMemoryRepository } from '../src';
import { CreateBunshinMemory } from '../src';

describe('Bunshin Memory use cases', () => {
  it('normalizes and validates user input memory', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'memory-1' });
    const repository = { create } as unknown as BunshinMemoryRepository;
    await new CreateBunshinMemory(repository).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
      type: 'BELIEF',
      content: ' Value ',
      summary: ' Summary ',
      confidence: 0.8,
      importance: 3,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Value',
        summary: 'Summary',
        confidence: 0.8,
        importance: 3,
      }),
    );
  });
  it.each([
    { confidence: -0.1, importance: 3 },
    { confidence: 1.1, importance: 3 },
    { confidence: 0.5, importance: 0 },
    { confidence: 0.5, importance: 6 },
  ])('rejects invalid confidence or importance: %o', async ({ confidence, importance }) => {
    const repository = { create: vi.fn() } as unknown as BunshinMemoryRepository;
    await expect(
      new CreateBunshinMemory(repository).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        bunshinId: 'bunshin-1',
        type: 'BELIEF',
        content: 'Value',
        confidence,
        importance,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
