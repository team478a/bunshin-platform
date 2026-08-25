import type { BunshinMemory } from '@bunshin/platform-domain';
import { describe, expect, it, vi } from 'vitest';
import { SelectBunshinMemories, type BunshinMemoryRepository } from '../src/index';

const now = new Date('2026-08-25T00:00:00.000Z');
const memory = (overrides: Partial<BunshinMemory> = {}): BunshinMemory => ({
  id: 'memory-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  type: 'EXPERIENCE',
  content: '副業を始めたとき、毎日5分だけSNS投稿を続けた',
  summary: '副業のSNS投稿を続けた経験',
  sourceType: 'USER_INPUT',
  sourceId: null,
  confidence: 0.9,
  importance: 4,
  active: true,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const repository = (values: BunshinMemory[]): BunshinMemoryRepository => ({
  create: vi.fn(),
  list: vi.fn().mockResolvedValue(values),
  find: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  softDelete: vi.fn(),
});

const scope = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  bunshinId: 'bunshin-1',
  query: '副業初心者向けのSNS投稿を続ける方法',
};

describe('SelectBunshinMemories', () => {
  it('selects only relevant active memories and returns an auditable reason', async () => {
    const selected = await new SelectBunshinMemories(
      repository([
        memory(),
        memory({ id: 'unrelated', content: '旅行先のホテル', summary: '旅行の記録' }),
        memory({ id: 'inactive', active: false }),
      ]),
    ).execute(scope);

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      id: 'memory-1',
      summary: '副業のSNS投稿を続けた経験',
    });
    expect(selected[0]?.selectionReason).toContain('重要度 4/5');
  });

  it('rejects memories returned from another workspace or Bunshin as defense in depth', async () => {
    const selected = await new SelectBunshinMemories(
      repository([
        memory({ id: 'other-workspace', workspaceId: 'workspace-2' }),
        memory({ id: 'other-bunshin', bunshinId: 'bunshin-2' }),
      ]),
    ).execute(scope);

    expect(selected).toEqual([]);
  });

  it('keeps the character budget and does not fill it with unrelated memories', async () => {
    const selected = await new SelectBunshinMemories(
      repository([
        memory({ id: 'too-long', content: `副業SNS${'投稿'.repeat(260)}` }),
        memory({ id: 'fits', content: '副業SNSを5分続ける', summary: '短い経験' }),
        memory({ id: 'unrelated', content: '料理の献立', summary: '夕食' }),
      ]),
    ).execute({ ...scope, maxCharacters: 500 });

    expect(selected.map(({ id }) => id)).toEqual(['fits']);
  });

  it('validates selector limits', async () => {
    await expect(
      new SelectBunshinMemories(repository([])).execute({ ...scope, maxItems: 0 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
