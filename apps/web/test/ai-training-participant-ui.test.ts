import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx', import.meta.url),
  'utf8',
);
const card = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-card.tsx',
    import.meta.url,
  ),
  'utf8',
);
const http = readFileSync(
  new URL('../src/http/ai-training-participant.ts', import.meta.url),
  'utf8',
);

describe('AI training participant UI', () => {
  it('dispatches the existing program page by the scoped module key', () => {
    expect(page).toContain('AI_TRAINING_V1_MODULE_KEY');
    expect(page).toContain('groupMembershipId: membership.id');
    expect(page).toContain('<AiTrainingCard');
  });

  it('provides a mobile-friendly assessment, goal, task, answer and evaluation flow', () => {
    expect(card).toContain('今の仕事に近いもの');
    expect(card).toContain('AI・ChatGPTの経験');
    expect(card).toContain('仕事で困っていること');
    expect(card).toContain('学びたいテーマ');
    expect(card).toContain('30日後にできるようになりたいこと');
    expect(card).toContain('1日に使える時間');
    expect(card).toContain('この内容で研修を始める');
    expect(card).toContain('あなたの目標');
    expect(card).toContain('今回できるようになること');
    expect(card).toContain('実務の場面');
    expect(card).toContain('確認ポイント');
    expect(card).toContain('よくある失敗を見る');
    expect(card).toContain('あなたの回答');
    expect(card).toContain('今回確認した力');
    expect(card).toContain('skillStateLabel');
    expect(card).toContain('回答の確認を再開する');
    expect(card).toContain('次の課題を見る');
  });

  it('uses same-origin authenticated endpoints and idempotency keys', () => {
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('PrismaTrainingParticipantProfileRepository');
    expect(http).toContain('TRAINING_GOAL_KEYS');
    expect(card).toContain('idempotencyKey: profileKey.current');
    expect(card).toContain('idempotencyKey: answerKey.current');
    expect(card).toContain('idempotencyKey: evaluationKey.current');
  });
});
