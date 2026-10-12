import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  PRACTICE_SUPPORT_VERSION,
  validatePracticeSupportAdvice,
  validatePracticeSupportCommand,
  type PersonalLearningActor,
  type PracticeSupportState,
  type SavedPracticeSupport,
} from '@bunshin/application';

export const supportObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const SUPPORT_REQUEST_EVENT = 'PERSONAL_LEARNING_SUPPORT_REQUEST';
export const SUPPORT_RESPONSE_EVENT = 'PERSONAL_LEARNING_SUPPORT_RESPONSE';
export async function readPracticeSupportHistory(
  tx: Prisma.TransactionClient,
  actor: PersonalLearningActor,
  assignmentId: string,
  candidateId: string,
): Promise<PracticeSupportState> {
  const rows = await tx.programActionEvent.findMany({
    where: {
      workspaceId: actor.scope.workspaceId,
      groupId: actor.scope.groupId,
      programEnrollmentId: actor.scope.programEnrollmentId,
      actorUserId: actor.actorUserId,
      missionAssignmentId: assignmentId,
      eventType: { in: [SUPPORT_REQUEST_EVENT, SUPPORT_RESPONSE_EVENT] },
    },
    take: 2001,
    orderBy: { occurredAt: 'desc' },
  });
  const conflict = (): never => {
    throw new ApplicationError('CONFLICT', 'support history unavailable');
  };
  if (rows.length > 2000) return conflict();
  const requests = rows.filter((r) => r.eventType === SUPPORT_REQUEST_EVENT);
  const replies = rows.filter((r) => r.eventType === SUPPORT_RESPONSE_EVENT);
  const history: SavedPracticeSupport[] = requests
    .map((row): SavedPracticeSupport => {
      const m = supportObject(row.metadata);
      if (
        m.version !== PRACTICE_SUPPORT_VERSION ||
        m.candidateId !== candidateId ||
        m.materialVersion !== 1 ||
        typeof m.operationId !== 'string' ||
        typeof m.revision !== 'number' ||
        !Number.isSafeInteger(m.revision) ||
        m.revision < 1 ||
        m.revision > 1000 ||
        typeof m.noteRevision !== 'number'
      )
        return conflict();
      const reason = m.reason as SavedPracticeSupport['reason'];
      const text = m.text as string;
      validatePracticeSupportCommand({
        actor,
        assignmentId,
        operationId: m.operationId,
        expectedNoteRevision: m.noteRevision,
        expectedSupportRevision: m.revision - 1,
        reason,
        text,
      });
      const responses = replies.filter((r) => supportObject(r.metadata).requestId === row.id);
      if (responses.length > 1) return conflict();
      const reply = responses[0] ? supportObject(responses[0].metadata) : null;
      if (
        reply &&
        (reply.version !== PRACTICE_SUPPORT_VERSION ||
          !['READY', 'FAILED', 'STALE'].includes(String(reply.status)))
      )
        return conflict();
      if (
        reply?.status === 'READY' &&
        (typeof reply.promptVersion !== 'string' || typeof reply.usageKey !== 'string')
      )
        return conflict();
      return {
        id: row.id,
        operationId: m.operationId,
        revision: m.revision,
        noteRevision: m.noteRevision,
        candidateId,
        materialVersion: 1,
        reason,
        text,
        requestedAt: row.occurredAt.toISOString(),
        status: reply ? (reply.status as SavedPracticeSupport['status']) : 'PENDING',
        advice: reply?.status === 'READY' ? validatePracticeSupportAdvice(reply.advice) : null,
        promptVersion: typeof reply?.promptVersion === 'string' ? reply.promptVersion : null,
        usageKey: typeof reply?.usageKey === 'string' ? reply.usageKey : null,
      };
    })
    .sort((a, b) => b.revision - a.revision);
  // Revisions are contiguous immutable requests; truncated/corrupt history is not silently accepted.
  if (
    history.some((r, i) => r.revision !== history.length - i) ||
    replies.some((r) => !requests.some((q) => q.id === supportObject(r.metadata).requestId))
  )
    return conflict();
  return { revision: history.length, history: history.slice(0, 20) };
}
