import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  PRACTICE_SUPPORT_VERSION,
  validatePracticeSupportCommand,
  validatePracticeSupportAdvice,
  type PracticeSupportRepository,
  type PracticeSupportCommand,
  type PersonalLearningActor,
  type PersonalLearningTextOperation,
} from '@bunshin/application';
import { PrismaPersonalLearningPracticeRepository } from './personal-learning-practice';
import {
  supportObject,
  SUPPORT_REQUEST_EVENT,
  SUPPORT_RESPONSE_EVENT,
} from './personal-learning-practice-support-history';
import { personalLearningOperationHash } from './personal-learning-operation-identity';

const digest = (input: PracticeSupportCommand) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        input.assignmentId,
        input.expectedNoteRevision,
        input.expectedSupportRevision,
        input.reason,
        input.text,
      ]),
    )
    .digest('hex');
const conflict = (): never => {
  throw new ApplicationError('CONFLICT', 'support state changed');
};
/** Append-only support, not an Answer or achievement. AI never runs in these transactions. */
export class PrismaPracticeSupportRepository
  extends PrismaPersonalLearningPracticeRepository
  implements PracticeSupportRepository
{
  async prepareSupport(input: PracticeSupportCommand) {
    validatePracticeSupportCommand(input);
    return this.authorized(input.actor, true, async (tx, now) => {
      const actor = input.actor,
        s = actor.scope;
      await this.normalLearner(tx, actor);
      if (!(await this.policy(tx, actor)).allowed)
        throw new ApplicationError('CONFIGURATION_ERROR', 'practice policy unavailable');
      const row = await this.current(tx, actor);
      if (!row || row.id !== input.assignmentId) return conflict();
      const practice = await this.projectPractice(tx, actor, row);
      const key = 'practice-support-request:' + input.operationId;
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        if (
          prior.actorUserId !== s.userId ||
          prior.programEnrollmentId !== s.programEnrollmentId ||
          prior.missionAssignmentId !== row.id ||
          prior.eventType !== SUPPORT_REQUEST_EVENT ||
          supportObject(prior.metadata).digest !== digest(input)
        )
          return conflict();
        const request = practice.support.history.find((r) => r.id === prior.id);
        if (!request) return conflict(); // Old retries outside the bounded history require explicit review.
        return { practice, request, created: false };
      }
      if (
        (practice.note?.revision ?? 0) !== input.expectedNoteRevision ||
        practice.support.revision !== input.expectedSupportRevision ||
        practice.support.history.some((r) => r.status === 'PENDING')
      )
        return conflict();
      const event = await tx.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          missionAssignmentId: row.id,
          actorUserId: s.userId,
          eventType: SUPPORT_REQUEST_EVENT,
          idempotencyKey: key,
          occurredAt: now,
          metadata: {
            version: PRACTICE_SUPPORT_VERSION,
            digest: digest(input),
            operationId: input.operationId,
            revision: input.expectedSupportRevision + 1,
            noteRevision: input.expectedNoteRevision,
            candidateId: practice.candidate.id,
            materialVersion: 1,
            reason: input.reason,
            text: input.text,
          },
        },
      });
      const updated = await this.projectPractice(tx, actor, row);
      const request = updated.support.history.find((r) => r.id === event.id);
      if (!request) return conflict();
      return { practice: updated, request, created: true };
    });
  }
  /** Same enrollment transaction/lock used by admission; latest DRAFT is not the running wish. */
  protected async assertSupportAdmission(
    tx: Prisma.TransactionClient,
    input: PersonalLearningTextOperation,
  ) {
    const p = input.practice;
    if (!p || !(await this.policy(tx, input.actor)).allowed) return conflict();
    const row = await this.current(tx, input.actor);
    if (!row || row.id !== p.assignmentId) return conflict();
    const practice = await this.projectPractice(tx, input.actor, row);
    const request = practice.support.history.find((r) => r.id === p.supportRequestId);
    if (
      practice.candidate.requestId !== input.requestId ||
      practice.candidate.requestRevision !== input.expectedRequestRevision ||
      (practice.note?.revision ?? 0) !== p.noteRevision ||
      practice.support.revision !== p.supportRevision ||
      !request ||
      request.status !== 'PENDING' ||
      request.operationId !== input.operationId ||
      request.noteRevision !== p.noteRevision ||
      request.revision !== p.supportRevision
    )
      return conflict();
  }
  async completeSupport(input: Parameters<PracticeSupportRepository['completeSupport']>[0]) {
    validatePracticeSupportCommand(input.command);
    const advice = validatePracticeSupportAdvice(input.advice);
    return this.authorized(input.command.actor, true, async (tx, now) => {
      const actor = input.command.actor,
        s = actor.scope;
      await this.normalLearner(tx, actor);
      if (!(await this.policy(tx, actor)).allowed)
        throw new ApplicationError('CONFIGURATION_ERROR', 'practice policy unavailable');
      const row = await this.current(tx, actor);
      if (!row || row.id !== input.command.assignmentId) return conflict();
      const practice = await this.projectPractice(tx, actor, row);
      const request = practice.support.history.find((r) => r.id === input.requestId);
      if (
        !request ||
        request.operationId !== input.command.operationId ||
        request.text !== input.command.text ||
        request.reason !== input.command.reason ||
        request.noteRevision !== input.command.expectedNoteRevision ||
        request.revision !== input.command.expectedSupportRevision + 1
      )
        return conflict();
      if (request.status !== 'PENDING') return conflict();
      if (
        input.usageKey !==
        `personal-learning-operation:${personalLearningOperationHash({ ...input.command, attempt: 1 })}`
      )
        return conflict();
      const receipt = await tx.aiUsageEvent.findFirst({
        where: {
          workspaceId: s.workspaceId,
          actorUserId: s.userId,
          idempotencyKey: input.usageKey,
          taskType: 'PERSONAL_LEARNING_PRACTICE_SUPPORT',
          promptVersion: input.promptVersion,
          status: 'SUCCESS',
          estimatedCostUsdMicros: { not: null },
        },
      });
      if (!receipt) throw new ApplicationError('CONFLICT', 'support receipt unavailable');
      const stale =
        (practice.note?.revision ?? 0) !== request.noteRevision ||
        practice.support.revision !== request.revision;
      await this.response(tx, actor, row.id, input.requestId, now, {
        status: stale ? 'STALE' : 'READY',
        usageKey: input.usageKey,
        promptVersion: input.promptVersion,
        ...(stale ? {} : { advice: { ...advice } }),
      });
      return this.projectPractice(tx, actor, row);
    });
  }
  async failSupport(input: Parameters<PracticeSupportRepository['failSupport']>[0]) {
    validatePracticeSupportCommand(input.command);
    await this.authorized(input.command.actor, true, async (tx, now) => {
      const actor = input.command.actor;
      await this.normalLearner(tx, actor);
      const row = await this.current(tx, actor);
      if (!row || row.id !== input.command.assignmentId) return conflict();
      const practice = await this.projectPractice(tx, actor, row);
      const request = practice.support.history.find((r) => r.id === input.requestId);
      if (
        !request ||
        request.operationId !== input.command.operationId ||
        request.text !== input.command.text ||
        request.reason !== input.command.reason
      )
        return conflict();
      if (request.status !== 'PENDING') return;
      // No raw Provider exception, diagnosis, score or speculative cost is saved.
      const usageKey = `personal-learning-operation:${personalLearningOperationHash({ ...input.command, attempt: 1 })}`;
      const receipt = await tx.aiUsageEvent.findFirst({
        where: {
          workspaceId: actor.scope.workspaceId,
          actorUserId: actor.actorUserId,
          idempotencyKey: usageKey,
          taskType: 'PERSONAL_LEARNING_PRACTICE_SUPPORT',
        },
        select: { promptVersion: true },
      });
      await this.response(tx, actor, row.id, input.requestId, now, {
        status: 'FAILED',
        ...(receipt ? { usageKey, promptVersion: receipt.promptVersion } : {}),
      });
    });
  }
  private response(
    tx: Prisma.TransactionClient,
    actor: PersonalLearningActor,
    assignmentId: string,
    requestId: string,
    now: Date,
    metadata: Prisma.InputJsonObject,
  ) {
    const s = actor.scope;
    return tx.programActionEvent.create({
      data: {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        missionAssignmentId: assignmentId,
        actorUserId: s.userId,
        eventType: SUPPORT_RESPONSE_EVENT,
        idempotencyKey: 'practice-support-response:' + requestId,
        occurredAt: now,
        metadata: { ...metadata, version: PRACTICE_SUPPORT_VERSION, requestId },
      },
    });
  }
}
