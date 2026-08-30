import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { serviceKnowledgeForPrompt } from '../src/services/service-generation-knowledge';

const strategySource = readFileSync(
  new URL('../src/http/service-account-strategies.ts', import.meta.url),
  'utf8',
);
const weeklySource = readFileSync(
  new URL('../src/http/service-weekly-plans.ts', import.meta.url),
  'utf8',
);
const dailySource = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);

describe('service generation knowledge', () => {
  it('maps approved service chunks to instruction-safe prompt data', () => {
    const result = serviceKnowledgeForPrompt([
      {
        id: 'chunk-1',
        sourceId: 'source-1',
        sortOrder: 0,
        type: 'FAQ',
        content: '  返品は30日以内です。  ',
        sourceLabel: 'よくある質問',
        pageNumber: 2,
        startSeconds: null,
        endSeconds: null,
        confidence: 0.9,
      },
    ]);

    expect(result.officialKnowledge).toEqual([
      { type: 'SERVICE_FAQ', title: 'よくある質問', content: '返品は30日以内です。' },
    ]);
    expect(result.groupKnowledge[0]).toMatchObject({
      chunkId: 'chunk-1',
      sourceId: 'source-1',
      type: 'FAQ',
    });
  });

  it('loads official knowledge with server-resolved service scope for every generator', () => {
    for (const source of [strategySource, weeklySource, dailySource]) {
      expect(source).toContain('loadServiceGenerationKnowledge');
      expect(source).toContain('groupId: input.groupId');
      expect(source).toContain('actorUserId: input.actorUserId');
    }
    expect(strategySource).not.toContain('grantedKnowledge: []');
    expect(weeklySource).toContain('additionalKnowledge: serviceKnowledge.officialKnowledge');
    expect(dailySource).toContain(').groupKnowledge');
  });
});
