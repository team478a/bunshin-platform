import { describe, expect, it } from 'vitest';
import {
  PERSONAL_LEARNING_CONVERSATION_CONTEXT_TURNS,
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
    expect(() => validatePersonalLearningConversationCommand(command)).not.toThrow();
    expect(() =>
      validatePersonalLearningConversationCommand({
        ...command,
        text: 'x'.repeat(PERSONAL_LEARNING_CONVERSATION_MAX_MESSAGE_LENGTH + 1),
      }),
    ).toThrow();
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
