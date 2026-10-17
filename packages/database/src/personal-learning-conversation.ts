import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  PERSONAL_LEARNING_CONVERSATION_CONTEXT_TURNS,
  PERSONAL_LEARNING_CONVERSATION_VERSION,
  validatePersonalLearningConversationCommand,
  validatePersonalLearningConversationResponse,
  type PersonalLearningConversationCommand,
  type PersonalLearningConversationMessage,
  type PersonalLearningConversationRepository,
  type PersonalLearningConversationState,
  type PersonalLearningActor,
} from '@bunshin/application';
import { personalLearningFeatureEnabled } from '@bunshin/capability-training';
import { PrismaPersonalLearningPracticeRepository } from './personal-learning-practice';
import { personalLearningOperationHash } from './personal-learning-operation-identity';

export const CONVERSATION_MESSAGE_EVENT = 'PERSONAL_LEARNING_CONVERSATION_MESSAGE';
export const CONVERSATION_RESPONSE_EVENT = 'PERSONAL_LEARNING_CONVERSATION_RESPONSE';
export const CONVERSATION_SHARE_EVENT = 'PERSONAL_LEARNING_CONVERSATION_SHARE';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const digest = (input: PersonalLearningConversationCommand) =>
  createHash('sha256')
    .update(JSON.stringify([input.requestId, input.requestRevision, input.text]))
    .digest('hex');
const conflict = (): never => {
  throw new ApplicationError('CONFLICT', 'learning conversation changed');
};

export class PrismaPersonalLearningConversationRepository
  extends PrismaPersonalLearningPracticeRepository
  implements PersonalLearningConversationRepository
{
  constructor(
    private readonly conversationClient: PrismaClient,
    now = () => new Date(),
  ) {
    super(conversationClient, now);
  }
  private async assertEnabled(tx: Prisma.TransactionClient, actor: PersonalLearningActor) {
    const enrollment = await tx.programEnrollment.findUniqueOrThrow({
      where: { id: actor.scope.programEnrollmentId },
    });
    const program = await tx.serviceProgram.findFirst({
      where: {
        id: enrollment.serviceProgramId,
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
      },
      select: { settings: true },
    });
    if (!program || !personalLearningFeatureEnabled(program.settings, 'conversation'))
      throw new ApplicationError('NOT_FOUND', 'learning conversation unavailable');
    return enrollment;
  }

  private async projectConversation(
    tx: Prisma.TransactionClient,
    actor: PersonalLearningActor,
    requestId: string,
    requestRevision: number,
  ): Promise<PersonalLearningConversationState> {
    const s = actor.scope;
    const rows = await tx.programActionEvent.findMany({
      where: {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        actorUserId: s.userId,
        eventType: {
          in: [CONVERSATION_MESSAGE_EVENT, CONVERSATION_RESPONSE_EVENT, CONVERSATION_SHARE_EVENT],
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: 2001,
    });
    if (rows.length > 2000) return conflict();
    const scoped = rows.filter((row) => {
      const metadata = object(row.metadata);
      return (
        metadata.version === PERSONAL_LEARNING_CONVERSATION_VERSION &&
        metadata.threadId === requestId &&
        metadata.requestRevision === requestRevision
      );
    });
    const learnerMessages = scoped
      .filter((row) => row.eventType === CONVERSATION_MESSAGE_EVENT)
      .map((row): PersonalLearningConversationMessage => {
        const metadata = object(row.metadata);
        if (
          metadata.operationId === undefined ||
          typeof metadata.operationId !== 'string' ||
          !/^[0-9a-f-]{36}$/i.test(metadata.operationId) ||
          typeof metadata.text !== 'string' ||
          metadata.text.trim() !== metadata.text ||
          metadata.text.length < 1 ||
          metadata.text.length > 1200
        )
          return conflict();
        const reply = scoped.filter(
          (candidate) =>
            candidate.eventType === CONVERSATION_RESPONSE_EVENT &&
            object(candidate.metadata).requestId === row.id,
        );
        if (reply.length > 1) return conflict();
        const response = reply[0] ? object(reply[0].metadata) : null;
        if (
          response &&
          (response.version !== PERSONAL_LEARNING_CONVERSATION_VERSION ||
            !['READY', 'FAILED'].includes(String(response.status)))
        )
          return conflict();
        return {
          id: row.id,
          operationId: metadata.operationId,
          role: 'USER',
          text: metadata.text,
          status: response ? (response.status as 'READY' | 'FAILED') : 'PENDING',
          createdAt: row.occurredAt.toISOString(),
          promptVersion:
            typeof response?.promptVersion === 'string' ? response.promptVersion : null,
          responseStatus: null,
        };
      });
    const replies = scoped.filter((row) => row.eventType === CONVERSATION_RESPONSE_EVENT);
    if (
      replies.some(
        (row) => !learnerMessages.some((message) => message.id === object(row.metadata).requestId),
      )
    )
      return conflict();
    const assistantMessages = scoped
      .filter((row) => row.eventType === CONVERSATION_RESPONSE_EVENT)
      .flatMap((row): PersonalLearningConversationMessage[] => {
        const metadata = object(row.metadata);
        if (metadata.status !== 'READY') return [];
        const original = learnerMessages.find((message) => message.id === metadata.requestId);
        if (
          !original ||
          typeof metadata.text !== 'string' ||
          !metadata.text.trim() ||
          !['ANSWER', 'NEEDS_CONTEXT', 'OUT_OF_SCOPE'].includes(String(metadata.responseStatus))
        )
          return conflict();
        return [
          {
            id: row.id,
            operationId: original.operationId,
            role: 'ASSISTANT',
            text: metadata.text,
            status: 'READY',
            createdAt: row.occurredAt.toISOString(),
            promptVersion:
              typeof metadata.promptVersion === 'string' ? metadata.promptVersion : null,
            responseStatus: metadata.responseStatus as 'ANSWER' | 'NEEDS_CONTEXT' | 'OUT_OF_SCOPE',
          },
        ];
      });
    const messages = [...learnerMessages, ...assistantMessages].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const shareEvents = scoped
      .filter((row) => row.eventType === CONVERSATION_SHARE_EVENT)
      .sort(
        (a, b) =>
          Number(object(a.metadata).shareRevision ?? 0) -
          Number(object(b.metadata).shareRevision ?? 0),
      );
    let sharedAt: string | null = null;
    for (const event of shareEvents) {
      const metadata = object(event.metadata);
      if (metadata.shared === true) sharedAt = event.occurredAt.toISOString();
      else if (metadata.shared === false) sharedAt = null;
      else return conflict();
    }
    return {
      threadId: requestId,
      requestId,
      requestRevision,
      messages: messages.slice(-100),
      sharedAt,
    };
  }

  async readConversation(actor: PersonalLearningActor) {
    return this.authorized(actor, false, async (tx) => {
      await this.normalLearner(tx, actor);
      await this.assertEnabled(tx, actor);
      const request = await tx.personalLearningRequest.findFirst({
        where: actor.scope,
        orderBy: { revision: 'desc' },
      });
      return request ? this.projectConversation(tx, actor, request.id, request.revision) : null;
    });
  }

  async setConversationSharing(input: {
    actor: PersonalLearningActor;
    requestId: string;
    requestRevision: number;
    operationId: string;
    shared: boolean;
  }) {
    const uuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (
      !uuid(input.requestId) ||
      !uuid(input.operationId) ||
      !Number.isSafeInteger(input.requestRevision) ||
      input.requestRevision < 1
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid conversation sharing operation');
    return this.authorized(input.actor, true, async (tx, now) => {
      const actor = input.actor;
      await this.normalLearner(tx, actor);
      await this.assertEnabled(tx, actor);
      const request = await tx.personalLearningRequest.findFirst({
        where: { ...actor.scope, id: input.requestId, revision: input.requestRevision },
      });
      if (!request) return conflict();
      const key = `learning-conversation-share:${input.operationId}`;
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: actor.scope.workspaceId,
            groupId: actor.scope.groupId,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        const metadata = object(prior.metadata);
        if (
          prior.actorUserId !== actor.scope.userId ||
          prior.programEnrollmentId !== actor.scope.programEnrollmentId ||
          prior.eventType !== CONVERSATION_SHARE_EVENT ||
          metadata.threadId !== request.id ||
          metadata.requestRevision !== request.revision ||
          metadata.shared !== input.shared
        )
          return conflict();
        return this.projectConversation(tx, actor, request.id, request.revision);
      }
      const previousShares = await tx.programActionEvent.findMany({
        where: {
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          programEnrollmentId: actor.scope.programEnrollmentId,
          actorUserId: actor.scope.userId,
          eventType: CONVERSATION_SHARE_EVENT,
        },
        select: { metadata: true },
        take: 1000,
      });
      const shareRevision =
        previousShares
          .map(({ metadata }) => object(metadata))
          .filter(
            (metadata) =>
              metadata.threadId === request.id && metadata.requestRevision === request.revision,
          )
          .reduce(
            (maximum, metadata) => Math.max(maximum, Number(metadata.shareRevision ?? 0)),
            0,
          ) + 1;
      await tx.programActionEvent.create({
        data: {
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          programEnrollmentId: actor.scope.programEnrollmentId,
          actorUserId: actor.scope.userId,
          eventType: CONVERSATION_SHARE_EVENT,
          idempotencyKey: key,
          occurredAt: now,
          metadata: {
            version: PERSONAL_LEARNING_CONVERSATION_VERSION,
            threadId: request.id,
            requestRevision: request.revision,
            operationId: input.operationId,
            shareRevision,
            shared: input.shared,
          },
        },
      });
      return this.projectConversation(tx, actor, request.id, request.revision);
    });
  }

  /** The operator can read only after explicit learner sharing; viewing itself is audited. */
  async readSharedConversationForOperator(input: {
    workspaceId: string;
    groupId: string;
    programEnrollmentId: string;
    requestId: string;
    operatorUserId: string;
  }) {
    const uuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (
      ![
        input.workspaceId,
        input.groupId,
        input.programEnrollmentId,
        input.requestId,
        input.operatorUserId,
      ].every(uuid)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid conversation scope');
    return this.conversationClient.$transaction(
      async (tx) => {
        const membership = await tx.groupMembership.findFirst({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            userId: input.operatorUserId,
            status: 'ACTIVE',
            serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
            user: { status: 'ACTIVE' },
            group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (!membership) throw new ApplicationError('NOT_FOUND', 'conversation unavailable');
        const request = await tx.personalLearningRequest.findFirst({
          where: {
            id: input.requestId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: input.programEnrollmentId,
          },
          orderBy: { revision: 'desc' },
        });
        if (!request) return null;
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: input.programEnrollmentId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
          },
          select: { id: true, groupMembershipId: true, serviceProgramId: true },
        });
        if (!enrollment || enrollment.id !== request.programEnrollmentId) return null;
        const trainingProgram = await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
          },
          select: { id: true, settings: true },
        });
        if (
          !trainingProgram ||
          !personalLearningFeatureEnabled(trainingProgram.settings, 'conversation')
        )
          return null;
        const sharing = await tx.programActionEvent.findMany({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: input.programEnrollmentId,
            actorUserId: request.userId,
            eventType: CONVERSATION_SHARE_EVENT,
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 100,
        });
        const latest = sharing
          .filter((event) => {
            const metadata = object(event.metadata);
            return (
              metadata.version === PERSONAL_LEARNING_CONVERSATION_VERSION &&
              metadata.threadId === request.id &&
              metadata.requestRevision === request.revision
            );
          })
          .sort(
            (a, b) =>
              Number(object(b.metadata).shareRevision ?? 0) -
              Number(object(a.metadata).shareRevision ?? 0),
          )[0];
        if (!latest || object(latest.metadata).shared !== true) return null;
        const actor: PersonalLearningActor = {
          actorUserId: request.userId,
          scope: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: input.programEnrollmentId,
            groupMembershipId: request.groupMembershipId,
            userId: request.userId,
          },
        };
        const state = await this.projectConversation(tx, actor, request.id, request.revision);
        if (!state || !state.sharedAt) return null;
        await tx.programAuditLog.create({
          data: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            resourceType: 'PERSONAL_LEARNING_REQUEST',
            resourceId: request.id,
            action: 'PERSONAL_LEARNING_CONVERSATION_VIEWED',
            afterData: { requestRevision: request.revision, threadId: request.id },
            performedByUserId: input.operatorUserId,
          },
        });
        return state;
      },
      { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 },
    );
  }

  async prepareTurn(input: PersonalLearningConversationCommand) {
    validatePersonalLearningConversationCommand(input);
    return this.authorized(input.actor, true, async (tx, now) => {
      const actor = input.actor;
      await this.normalLearner(tx, actor);
      await this.assertEnabled(tx, actor);
      const request = await tx.personalLearningRequest.findFirst({
        where: { ...actor.scope, id: input.requestId, revision: input.requestRevision },
      });
      if (!request) return conflict();
      const state = await this.projectConversation(tx, actor, request.id, request.revision);
      const key = `learning-conversation-request:${input.operationId}`;
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: actor.scope.workspaceId,
            groupId: actor.scope.groupId,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        const metadata = object(prior.metadata);
        if (
          prior.actorUserId !== actor.scope.userId ||
          prior.programEnrollmentId !== actor.scope.programEnrollmentId ||
          prior.eventType !== CONVERSATION_MESSAGE_EVENT ||
          metadata.digest !== digest(input)
        )
          return conflict();
        return {
          request: state.messages.find((message) => message.id === prior.id) ?? conflict(),
          context: [],
          created: false,
        };
      }
      if (state.messages.some((message) => message.status === 'PENDING')) return conflict();
      const event = await tx.programActionEvent.create({
        data: {
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          programEnrollmentId: actor.scope.programEnrollmentId,
          actorUserId: actor.scope.userId,
          eventType: CONVERSATION_MESSAGE_EVENT,
          idempotencyKey: key,
          occurredAt: now,
          metadata: {
            version: PERSONAL_LEARNING_CONVERSATION_VERSION,
            threadId: request.id,
            requestRevision: request.revision,
            operationId: input.operationId,
            digest: digest(input),
            text: input.text,
            sequence: state.messages.length + 1,
          },
        },
      });
      const contextWithReplies = await this.context(tx, actor, request.id, request.revision);
      return {
        request: {
          id: event.id,
          operationId: input.operationId,
          role: 'USER' as const,
          text: input.text,
          status: 'PENDING' as const,
          createdAt: now.toISOString(),
          promptVersion: null,
          responseStatus: null,
        },
        context: contextWithReplies,
        created: true,
      };
    });
  }

  private async context(
    tx: Prisma.TransactionClient,
    actor: PersonalLearningActor,
    requestId: string,
    revision: number,
  ) {
    const state = await this.projectConversation(tx, actor, requestId, revision);
    const ready = state.messages
      .filter((message) => message.role === 'USER' && message.status === 'READY')
      .slice(-PERSONAL_LEARNING_CONVERSATION_CONTEXT_TURNS);
    const byMessage = await tx.programActionEvent.findMany({
      where: {
        workspaceId: actor.scope.workspaceId,
        groupId: actor.scope.groupId,
        programEnrollmentId: actor.scope.programEnrollmentId,
        actorUserId: actor.scope.userId,
        eventType: CONVERSATION_RESPONSE_EVENT,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: 2000,
    });
    const result: { role: 'USER' | 'ASSISTANT'; text: string }[] = [];
    for (const message of ready) {
      result.push({ role: 'USER', text: message.text });
      const reply = byMessage.find((row) => object(row.metadata).requestId === message.id);
      const response = reply ? object(reply.metadata).text : null;
      if (typeof response !== 'string' || !response.trim()) return conflict();
      result.push({ role: 'ASSISTANT', text: response });
    }
    return result;
  }

  async completeTurn(input: Parameters<PersonalLearningConversationRepository['completeTurn']>[0]) {
    validatePersonalLearningConversationCommand(input.command);
    const responseText = validatePersonalLearningConversationResponse(input.response);
    return this.authorized(input.command.actor, true, async (tx, now) => {
      const actor = input.command.actor;
      await this.normalLearner(tx, actor);
      await this.assertEnabled(tx, actor);
      const state = await this.projectConversation(
        tx,
        actor,
        input.command.requestId,
        input.command.requestRevision,
      );
      const request = state.messages.find(
        (message) => message.operationId === input.command.operationId,
      );
      if (!request || request.text !== input.command.text || request.status !== 'PENDING')
        return conflict();
      const operationKey = `personal-learning-operation:${personalLearningOperationHash({
        actor,
        operationId: input.command.operationId,
        attempt: 1,
      })}`;
      if (input.usageKey !== operationKey) return conflict();
      const usage = await tx.aiUsageEvent.findFirst({
        where: {
          workspaceId: actor.scope.workspaceId,
          actorUserId: actor.scope.userId,
          idempotencyKey: operationKey,
          taskType: 'PERSONAL_LEARNING_CONVERSATION_TURN',
          promptVersion: input.promptVersion,
          status: 'SUCCESS',
          estimatedCostUsdMicros: { not: null },
        },
      });
      if (!usage) return conflict();
      const reply = await tx.programActionEvent.create({
        data: {
          workspaceId: actor.scope.workspaceId,
          groupId: actor.scope.groupId,
          programEnrollmentId: actor.scope.programEnrollmentId,
          actorUserId: actor.scope.userId,
          eventType: CONVERSATION_RESPONSE_EVENT,
          idempotencyKey: `learning-conversation-response:${request.id}`,
          occurredAt: now,
          metadata: {
            version: PERSONAL_LEARNING_CONVERSATION_VERSION,
            threadId: input.command.requestId,
            requestRevision: input.command.requestRevision,
            requestId: request.id,
            operationId: input.command.operationId,
            status: 'READY',
            text: responseText,
            responseStatus: input.responseStatus,
            promptVersion: input.promptVersion,
            usageKey: operationKey,
          },
        },
      });
      void reply;
      return this.projectConversation(
        tx,
        actor,
        input.command.requestId,
        input.command.requestRevision,
      );
    });
  }

  async failTurn(input: PersonalLearningConversationCommand) {
    validatePersonalLearningConversationCommand(input);
    await this.authorized(input.actor, true, async (tx, now) => {
      await this.normalLearner(tx, input.actor);
      await this.assertEnabled(tx, input.actor);
      const state = await this.projectConversation(
        tx,
        input.actor,
        input.requestId,
        input.requestRevision,
      );
      const message = state.messages.find((item) => item.operationId === input.operationId);
      if (!message || message.text !== input.text) return conflict();
      if (message.status !== 'PENDING') return;
      await tx.programActionEvent.create({
        data: {
          workspaceId: input.actor.scope.workspaceId,
          groupId: input.actor.scope.groupId,
          programEnrollmentId: input.actor.scope.programEnrollmentId,
          actorUserId: input.actor.scope.userId,
          eventType: CONVERSATION_RESPONSE_EVENT,
          idempotencyKey: `learning-conversation-response:${message.id}`,
          occurredAt: now,
          metadata: {
            version: PERSONAL_LEARNING_CONVERSATION_VERSION,
            threadId: input.requestId,
            requestRevision: input.requestRevision,
            requestId: message.id,
            operationId: input.operationId,
            status: 'FAILED',
          },
        },
      });
    });
  }
}
