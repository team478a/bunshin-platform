import { describe, expect, it } from 'vitest';
import { personalizationAuditSummary } from '../src/services/personalization-audit-view-model';

describe('personalization audit view model', () => {
  it('exposes safe source labels and reference counts without raw personal content', () => {
    expect(
      personalizationAuditSummary({
        selectedMemories: [{ id: 'memory-1', summary: 'private content' }],
        groupKnowledge: [{ id: 'knowledge-1' }],
        quality: { verdict: 'PASS', issueCodes: [] },
        personalization: {
          mode: 'FALLBACK',
          sourceTypes: ['ONBOARDING_RESPONSE', 'USER_MEMORY', 'FEEDBACK_HISTORY'],
          recentMissions: [{ id: 'mission-1' }, { id: 'mission-2' }],
          recentFeedback: [{ id: 'feedback-1' }],
        },
      }),
    ).toEqual({
      mode: 'FALLBACK',
      sourceLabels: ['初期設定・本人回答', '本人が追加した情報', '投稿後の評価・不採用理由'],
      qualityVerdict: 'PASS',
      issueCodes: [],
      referenceCounts: {
        memories: 1,
        groupKnowledge: 1,
        pastMissions: 2,
        activities: 0,
        variants: 0,
        feedback: 1,
        decisions: 0,
        performance: 0,
      },
    });
  });
});
