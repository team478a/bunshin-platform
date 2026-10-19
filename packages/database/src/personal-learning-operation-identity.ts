import { createHash } from 'node:crypto';
import type { PersonalLearningTextOperation } from '@bunshin/application';
export function personalLearningOperationHash(
  input: Pick<PersonalLearningTextOperation, 'actor' | 'operationId' | 'attempt'> &
    Partial<Pick<PersonalLearningTextOperation, 'operationKind'>>,
  attempt = input.attempt,
) {
  const s = input.actor.scope;
  return createHash('sha256')
    .update(
      JSON.stringify([
        'LEARNING_TEXT_OPERATION_V1',
        s.workspaceId,
        s.groupId,
        s.programEnrollmentId,
        s.groupMembershipId,
        s.userId,
        input.operationKind === 'NUDGE_COPY' ? null : (input.actor.topicId ?? null),
        input.operationId,
        attempt,
      ]),
    )
    .digest('hex');
}
