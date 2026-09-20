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

  it('provides a mobile-friendly setup, task, answer and evaluation flow', () => {
    expect(card).toContain('今の仕事に近いもの');
    expect(card).toContain('AI・ChatGPTの経験');
    expect(card).toContain('今日の研修を始める');
    expect(card).toContain('あなたの回答');
    expect(card).toContain('回答の確認を再開する');
    expect(card).toContain('次の課題を見る');
  });

  it('uses same-origin authenticated endpoints and idempotency keys', () => {
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('PrismaTrainingParticipantProfileRepository');
    expect(card).toContain('idempotencyKey: profileKey.current');
    expect(card).toContain('idempotencyKey: answerKey.current');
    expect(card).toContain('idempotencyKey: evaluationKey.current');
  });
});
