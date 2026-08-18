import { describe, expect, it, vi } from 'vitest';
import type { OwnerKnowledgeRepository } from '../src';
import { CreateOwnerKnowledge } from '../src';

describe('Owner Knowledge use cases', () => {
  it('normalizes title and content before persistence', async () => {
    const create = vi.fn().mockResolvedValue({});
    const repository = { create } as unknown as OwnerKnowledgeRepository;
    await new CreateOwnerKnowledge(repository).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      type: 'SKILL',
      title: ' Skill ',
      content: ' Detail ',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Skill', content: 'Detail' }),
    );
  });

  it('rejects empty content before persistence', () => {
    const repository = { create: vi.fn() } as unknown as OwnerKnowledgeRepository;
    expect(() =>
      new CreateOwnerKnowledge(repository).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        type: 'SKILL',
        title: 'Skill',
        content: ' ',
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
