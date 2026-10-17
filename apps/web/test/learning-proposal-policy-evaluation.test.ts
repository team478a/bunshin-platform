import { describe, expect, it } from 'vitest';
import { validateLearningLessonProposal } from '@bunshin/application';
import { learningLessonBody } from '../src/providers/openai-learning-lesson';
import { learningConversationBody } from '../src/providers/openai-learning-conversation';
import { learningProposalPolicy } from '../src/providers/learning-proposal-policy';
import { learningProposalEvaluationSet } from './fixtures/learning-proposal-evaluation-set';

const request = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  createdAt: '2026-10-17T00:00:00.000Z',
  originalText: 'AIで仕事を効率化したい',
  deviceType: 'PC' as const,
  toolDescription: 'AIチャット',
  experienceDescription: null,
  currentPosition: null,
};
const permit = { maxRequestBytes: 20_000, maxOutputTokens: 900 };
const mockProposal = (outOfScope: boolean) =>
  validateLearningLessonProposal({
    status: outOfScope ? 'OUT_OF_SCOPE' : 'READY',
    reason: outOfScope ? '専門判断の代行は研修の対象外' : '本人が小さく試せる練習',
    questions: [],
    outcome: outOfScope ? '' : '自分で案を一つ修正できる',
    explanation: outOfScope ? '' : '例を比較し、違いを説明します。',
    example: outOfScope ? '' : '短い見本の一節',
    practice: outOfScope ? [] : ['見本を参考に自分の一文を作る'],
    evidence: outOfScope ? [] : ['修正した一文'],
    criteria: outOfScope ? [] : ['修正理由を一つ説明できる'],
  });

describe('PR-E synthetic proposal evaluation set', () => {
  it('covers at least 20 diverse wishes with 10 learner exchanges each', () => {
    expect(learningProposalEvaluationSet).toHaveLength(20);
    expect(
      new Set(learningProposalEvaluationSet.map((item) => item.persona.profession)).size,
    ).toBeGreaterThanOrEqual(8);
    for (const scenario of learningProposalEvaluationSet) {
      expect(scenario.turns).toHaveLength(10);
      expect(scenario.wish).not.toMatch(/^[\s\S]*?(?:住所|電話番号|生年月日):/);
    }
  });

  it('uses the identical shared proposal policy for first proposals and regeneration, with v2 preserved when OFF', () => {
    const firstOff = JSON.parse(learningLessonBody(request, 'gpt-5.2', permit, false)) as {
      input: { role: string; content: string }[];
    };
    const regenOff = JSON.parse(
      learningConversationBody({
        request,
        history: [],
        currentMessage: 'PCです',
        candidate: null,
        practice: null,
        model: 'gpt-5.2',
        permit,
        extendedScope: false,
      }),
    ) as { input: { role: string; content: string }[] };
    const firstOn = JSON.parse(learningLessonBody(request, 'gpt-5.2', permit, true)) as {
      input: { role: string; content: string }[];
    };
    const regenOn = JSON.parse(
      learningConversationBody({
        request,
        history: [],
        currentMessage: '画面の画像を送りました',
        candidate: null,
        practice: null,
        model: 'gpt-5.2',
        permit,
        extendedScope: true,
      }),
    ) as { input: { role: string; content: string }[] };
    const system = (body: typeof firstOff) =>
      body.input.find((item) => item.role === 'system')!.content;
    for (const body of [firstOff, regenOff])
      expect(system(body)).toContain(learningProposalPolicy(false).instructions);
    for (const body of [firstOn, regenOn]) {
      expect(system(body)).toContain(learningProposalPolicy(true).instructions);
      expect(system(body)).toContain('具体的な次の一歩');
    }
    expect(system(firstOn)).not.toBe(system(regenOn)); // conversation-only rules are additive.
  });

  it('checks mock initial and regenerated proposal shapes and core learner-safety criteria for every scenario', () => {
    for (const scenario of learningProposalEvaluationSet) {
      const firstProposal = mockProposal(scenario.expected.outOfScope);
      const regeneratedProposal = mockProposal(scenario.expected.outOfScope);
      for (const proposal of [firstProposal, regeneratedProposal]) {
        expect(proposal.status === 'OUT_OF_SCOPE').toBe(scenario.expected.outOfScope);
        if (proposal.status === 'READY') {
          expect(proposal.practice.length).toBeGreaterThan(0);
          expect(proposal.evidence.length).toBeGreaterThan(0);
          expect(proposal.criteria.length).toBeGreaterThan(0);
          expect(scenario.expected.leaveConcreteNextStep).toBe(true);
        }
      }
    }
  });
});
