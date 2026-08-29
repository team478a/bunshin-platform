import { describe, expect, it } from 'vitest';

import { summarizeGroupKnowledgeUsage } from '../src/knowledge/group-knowledge-usage';

describe('summarizeGroupKnowledgeUsage', () => {
  it('同じ投稿案で同じ資料の複数箇所を使っても1回として数える', () => {
    const result = summarizeGroupKnowledgeUsage(
      [
        {
          payload: { groupKnowledge: [{ id: 'chunk-1' }, { id: 'chunk-2' }] },
          generatedAt: new Date('2026-08-29T01:00:00.000Z'),
        },
        {
          payload: { groupKnowledge: [{ id: 'chunk-1' }] },
          generatedAt: new Date('2026-08-29T02:00:00.000Z'),
        },
      ],
      [
        { id: 'chunk-1', sourceId: 'source-1' },
        { id: 'chunk-2', sourceId: 'source-1' },
      ],
    );

    expect(result).toEqual([
      {
        sourceId: 'source-1',
        generationCount: 2,
        lastUsedAt: new Date('2026-08-29T02:00:00.000Z'),
      },
    ]);
  });

  it('壊れた参照や現在のグループにない参照を集計しない', () => {
    expect(
      summarizeGroupKnowledgeUsage(
        [
          {
            payload: { groupKnowledge: [null, {}, { id: 123 }, { id: 'other-chunk' }] },
            generatedAt: new Date('2026-08-29T01:00:00.000Z'),
          },
          { payload: null, generatedAt: new Date('2026-08-29T02:00:00.000Z') },
        ],
        [{ id: 'chunk-1', sourceId: 'source-1' }],
      ),
    ).toEqual([]);
  });
});
