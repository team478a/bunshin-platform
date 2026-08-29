import { describe, expect, it } from 'vitest';

import { compareGroupKnowledgeVersions } from '../src/knowledge/group-knowledge-version-diff';

describe('compareGroupKnowledgeVersions', () => {
  it('同じ位置の追加・変更・削除・変更なしを判定する', () => {
    const result = compareGroupKnowledgeVersions(
      [
        { id: 'old-1', content: '同じ 内容' },
        { id: 'old-2', content: '旧価格は100円' },
        { id: 'old-3', content: '削除される説明' },
      ],
      [
        { id: 'new-1', content: ' 同じ   内容 ' },
        { id: 'new-2', content: '新価格は120円' },
      ],
    );

    expect(result.map(({ status }) => status)).toEqual(['UNCHANGED', 'CHANGED', 'REMOVED']);
    expect(compareGroupKnowledgeVersions([], [{ id: 'new', content: '追加' }])[0]?.status).toBe(
      'ADDED',
    );
  });
});
