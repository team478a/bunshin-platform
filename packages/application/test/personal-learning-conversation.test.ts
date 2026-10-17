import { describe, expect, it } from 'vitest';
import {
  boundPersonalLearningConversationContext,
  PERSONAL_LEARNING_CONVERSATION_CONTEXT_TURNS,
  PERSONAL_LEARNING_CONVERSATION_CONTEXT_MAX_BYTES,
  PERSONAL_LEARNING_CONVERSATION_MAX_MESSAGE_LENGTH,
  validatePersonalLearningConversationCommand,
  validatePersonalLearningConversationResponse,
  type PersonalLearningConversationCommand,
} from '../src';

const id = '11111111-1111-4111-8111-111111111111';
const command: PersonalLearningConversationCommand = {
  actor: {
    actorUserId: id,
    scope: {
      workspaceId: id,
      groupId: id,
      programEnrollmentId: id,
      groupMembershipId: id,
      userId: id,
    },
  },
  requestId: id,
  requestRevision: 1,
  operationId: id,
  text: 'ここが分かりません',
};

describe('personal learning conversation contract', () => {
  it('bounds each learner message and retained prompt context', () => {
    expect(PERSONAL_LEARNING_CONVERSATION_CONTEXT_TURNS).toBe(8);
    expect(PERSONAL_LEARNING_CONVERSATION_CONTEXT_MAX_BYTES).toBe(10_000);
    expect(() => validatePersonalLearningConversationCommand(command)).not.toThrow();
    expect(() =>
      validatePersonalLearningConversationCommand({
        ...command,
        text: 'x'.repeat(PERSONAL_LEARNING_CONVERSATION_MAX_MESSAGE_LENGTH + 1),
      }),
    ).toThrow();
  });

  it('keeps at most eight complete exchanges and drops oldest exchanges at the UTF-8 byte limit', () => {
    const exchanges = Array.from({ length: 10 }, (_, index) => [
      { role: 'USER' as const, text: `質問${index}` },
      { role: 'ASSISTANT' as const, text: `回答${index}` },
    ]);
    const byCount = boundPersonalLearningConversationContext(exchanges);
    expect(byCount).toHaveLength(16);
    expect(byCount[0]?.text).toBe('質問2');

    const byBytes = boundPersonalLearningConversationContext([
      [
        { role: 'USER', text: '古い'.repeat(2000) },
        { role: 'ASSISTANT', text: '古い返答'.repeat(2000) },
      ],
      [
        { role: 'USER', text: '新しい質問' },
        { role: 'ASSISTANT', text: '新しい回答' },
      ],
    ]);
    expect(byBytes.map((message) => message.text)).toEqual(['新しい質問', '新しい回答']);
    expect(new TextEncoder().encode(JSON.stringify(byBytes)).byteLength).toBeLessThan(
      PERSONAL_LEARNING_CONVERSATION_CONTEXT_MAX_BYTES,
    );
  });

  it.each(['', ' 前後空白 ', 'x'.repeat(2401), null])(
    'rejects invalid AI response %j',
    (response) => {
      expect(() => validatePersonalLearningConversationResponse(response)).toThrow();
    },
  );

  it('keeps the original wish separate from a follow-up message', () => {
    expect(command).not.toHaveProperty('originalText');
    expect(command.text).toBe('ここが分かりません');
  });
});
