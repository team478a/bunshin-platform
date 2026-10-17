import { describe, expect, it } from 'vitest';
import {
  learningConversationBody,
  validateLearningConversationReply,
} from '../src/providers/openai-learning-conversation';

const request = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  createdAt: '2026-10-17T00:00:00.000Z',
  originalText: 'AIで仕事の文章を改善したい',
  deviceType: 'PC' as const,
  toolDescription: 'チャットAI',
  experienceDescription: null,
  currentPosition: '一文を書いた',
};

describe('versioned learning conversation provider', () => {
  it('uses the original wish as context and reserves the next learner step', () => {
    const body = learningConversationBody({
      request,
      history: [{ role: 'ASSISTANT', text: 'どんな文章ですか？' }],
      currentMessage: '社内向けのお知らせです',
      candidate: null,
      practice: null,
      model: 'gpt-5.2',
      permit: { maxRequestBytes: 12000, maxOutputTokens: 400 },
    });
    const parsed = JSON.parse(body) as { input: { role: string; content: string }[] };
    const prompt = parsed.input.map(({ content }) => content).join('\n');
    expect(prompt).toContain(request.originalText);
    expect(prompt).toContain('社内向けのお知らせです');
    expect(prompt).toContain('最後に本人が次に試せる小さな一歩');
    expect(prompt).toContain('課題の開始、提出、評価、修了');
  });

  it.each(['ANSWER', 'NEEDS_CONTEXT', 'OUT_OF_SCOPE'] as const)(
    'accepts bounded %s replies without deciding learner progress',
    (status) => {
      expect(
        validateLearningConversationReply({
          status,
          message: '次に試す一歩を一つ考えましょう。',
          regeneratedProposal: null,
          environmentCapture: null,
        }),
      ).toEqual({
        status,
        message: '次に試す一歩を一つ考えましょう。',
        regeneratedProposal: null,
        environmentCapture: null,
      });
    },
  );

  it('rejects extra provider output fields and empty responses', () => {
    expect(() =>
      validateLearningConversationReply({
        status: 'ANSWER',
        message: '回答',
        regeneratedProposal: null,
        environmentCapture: null,
        score: 1,
      }),
    ).toThrow();
    expect(() =>
      validateLearningConversationReply({
        status: 'ANSWER',
        message: ' ',
        regeneratedProposal: null,
        environmentCapture: null,
      }),
    ).toThrow();
    expect(() =>
      validateLearningConversationReply({
        status: 'ANSWER',
        message: '回答',
        regeneratedProposal: { status: 'READY' },
        environmentCapture: null,
      }),
    ).toThrow();
    expect(() =>
      validateLearningConversationReply({
        status: 'ANSWER',
        message: '回答',
        regeneratedProposal: null,
        environmentCapture: { deviceType: 'PC', toolDescription: 'ChatGPT' },
      }),
    ).toThrow();
  });
});
