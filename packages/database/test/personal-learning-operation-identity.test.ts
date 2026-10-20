import { describe, expect, it } from 'vitest';
import { personalLearningOperationHash } from '../src/personal-learning-operation-identity';
import type { PersonalLearningTextOperation } from '@bunshin/application';

const id = '11111111-1111-4111-8111-111111111111';
const operation = {
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
  operationId: id,
  attempt: 1,
} as const;

describe('Personal Learning admission identity', () => {
  it('keeps nudge reservations independent of a selected topic', () => {
    const first = {
      ...operation,
      operationKind: 'NUDGE_COPY' as const,
      actor: { ...operation.actor, topicId: '22222222-2222-4222-8222-222222222222' },
    } as Pick<PersonalLearningTextOperation, 'actor' | 'operationId' | 'attempt' | 'operationKind'>;
    const second = {
      ...first,
      actor: { ...operation.actor, topicId: '33333333-3333-4333-8333-333333333333' },
    };
    expect(personalLearningOperationHash(first)).toBe(personalLearningOperationHash(second));
  });

  it('preserves topic-specific identity for other learning operations', () => {
    const first = {
      ...operation,
      actor: { ...operation.actor, topicId: '22222222-2222-4222-8222-222222222222' },
    };
    const second = {
      ...operation,
      actor: { ...operation.actor, topicId: '33333333-3333-4333-8333-333333333333' },
    };
    expect(personalLearningOperationHash(first)).not.toBe(personalLearningOperationHash(second));
  });
});
