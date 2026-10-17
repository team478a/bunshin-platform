import { Prisma, type PrismaClient } from '@prisma/client';
import { personalLearningFeatureEnabled } from '@bunshin/capability-training';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';

export type DynamicLearningScope = {
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  groupMembershipId: string;
  userId: string;
};

export class PrismaPersonalLearningTopicRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(scope: DynamicLearningScope) {
    const enrollment = await this.ownedEnrollment(scope);
    if (!enrollment) return null;
    return this.client.personalLearningTopic.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        groupMembershipId: scope.groupMembershipId,
        userId: scope.userId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async create(scope: DynamicLearningScope, input: { title: string }) {
    const title = input.title.trim();
    if (!title || title.length > 160) return { outcome: 'INVALID' as const };
    return this.client.$transaction(
      async (tx) => {
        await lockTrainingEnrollmentData(tx, { ...scope, actorUserId: scope.userId });
        const enrollment = await this.ownedEnrollment(scope, tx);
        if (!enrollment) return { outcome: 'NOT_FOUND' as const };
        const program = await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
          },
          select: { settings: true },
        });
        const topicLimit = personalLearningFeatureEnabled(program?.settings, 'multiTopic') ? 3 : 1;
        const activeCount = await tx.personalLearningTopic.count({
          where: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            programEnrollmentId: scope.programEnrollmentId,
            groupMembershipId: scope.groupMembershipId,
            userId: scope.userId,
            status: 'ACTIVE',
          },
        });
        if (activeCount >= topicLimit) return { outcome: 'LIMIT_REACHED' as const };
        const topic = await tx.personalLearningTopic.create({
          data: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            programEnrollmentId: scope.programEnrollmentId,
            groupMembershipId: scope.groupMembershipId,
            userId: scope.userId,
            title,
            lastLearnerUseAt: new Date(),
          },
        });
        return { outcome: 'CREATED' as const, topic };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async setStatus(
    scope: DynamicLearningScope,
    topicId: string,
    status: 'ACTIVE' | 'PAUSED' | 'COMPLETED',
    now = new Date(),
  ) {
    return this.client.$transaction(
      async (tx) => {
        await lockTrainingEnrollmentData(tx, { ...scope, actorUserId: scope.userId });
        if (!(await this.ownedEnrollment(scope, tx))) return null;
        const topic = await tx.personalLearningTopic.findFirst({
          where: {
            id: topicId,
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            programEnrollmentId: scope.programEnrollmentId,
            groupMembershipId: scope.groupMembershipId,
            userId: scope.userId,
          },
          select: { id: true, status: true },
        });
        if (!topic) return null;
        if (status === 'ACTIVE' && topic.status !== 'ACTIVE') {
          const active = await tx.personalLearningTopic.count({
            where: {
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              programEnrollmentId: scope.programEnrollmentId,
              groupMembershipId: scope.groupMembershipId,
              userId: scope.userId,
              status: 'ACTIVE',
            },
          });
          const enrollment = await tx.programEnrollment.findFirst({
            where: {
              id: scope.programEnrollmentId,
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
            },
            select: { serviceProgramId: true },
          });
          const program = enrollment
            ? await tx.serviceProgram.findFirst({
                where: {
                  id: enrollment.serviceProgramId,
                  workspaceId: scope.workspaceId,
                  groupId: scope.groupId,
                },
                select: { settings: true },
              })
            : null;
          const multiTopic = personalLearningFeatureEnabled(program?.settings, 'multiTopic');
          if (active >= (multiTopic ? 3 : 1)) return { outcome: 'LIMIT_REACHED' as const };
        }
        const updated = await tx.personalLearningTopic.update({
          where: { id: topic.id },
          data: { status, endedAt: status === 'COMPLETED' ? now : null },
        });
        return { outcome: 'UPDATED' as const, topic: updated };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async ownedEnrollment(
    scope: DynamicLearningScope,
    client: PrismaClient | Prisma.TransactionClient = this.client,
  ) {
    const membership = await client.groupMembership.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        id: scope.groupMembershipId,
        userId: scope.userId,
        status: 'ACTIVE',
        serviceRole: 'PARTICIPANT',
      },
      select: { id: true },
    });
    if (!membership) return null;
    return client.programEnrollment.findFirst({
      where: {
        id: scope.programEnrollmentId,
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: scope.groupMembershipId,
        status: 'ACTIVE',
      },
      select: { id: true, serviceProgramId: true },
    });
  }
}

export type PersonaItemInput = {
  attributeKey: string;
  value: string;
  evidenceType: 'CONVERSATION_EVENT' | 'PRACTICE_ANSWER' | 'LEARNING_REQUEST';
  evidenceId: string;
  evidenceCreatedAt: Date;
};

/** Every operation is bound to the active member in one Workspace + Service (Group) + User. */
export class PrismaPersonalLearningPersonaRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  list(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
  ) {
    return this.client.personalLearningPersonaItem.findMany({
      where: scope,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async save(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
    input: PersonaItemInput,
  ) {
    const attributeKey = input.attributeKey.trim();
    const value = input.value.trim();
    if (!attributeKey || attributeKey.length > 80 || !value || value.length > 1000)
      return { outcome: 'INVALID' as const };
    const membership = await this.client.groupMembership.findFirst({
      where: { ...scope, status: 'ACTIVE', serviceRole: 'PARTICIPANT' },
      select: { id: true },
    });
    if (!membership) return { outcome: 'NOT_FOUND' as const };
    const item = await this.client.personalLearningPersonaItem.upsert({
      where: {
        workspaceId_groupId_groupMembershipId_attributeKey: {
          ...scope,
          attributeKey,
        },
      },
      create: {
        ...scope,
        ...input,
        attributeKey,
        value,
        status: 'UNCONFIRMED',
        lastLearnerUseAt: new Date(),
      },
      update: { ...input, value, status: 'UNCONFIRMED', lastLearnerUseAt: new Date() },
    });
    return { outcome: 'SAVED' as const, item };
  }

  async review(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
    itemId: string,
    input: { value?: string; status?: 'CONFIRMED' | 'REJECTED' },
  ) {
    if (input.value !== undefined && (!input.value.trim() || input.value.length > 1000))
      return { outcome: 'INVALID' as const };
    const result = await this.client.personalLearningPersonaItem.updateMany({
      where: { ...scope, id: itemId },
      data: {
        ...(input.value !== undefined ? { value: input.value.trim(), status: 'CONFIRMED' } : {}),
        ...(input.status ? { status: input.status } : {}),
        lastLearnerUseAt: new Date(),
      },
    });
    if (!result.count) return { outcome: 'NOT_FOUND' as const };
    return {
      outcome: 'UPDATED' as const,
      item: await this.client.personalLearningPersonaItem.findFirst({
        where: { ...scope, id: itemId },
      }),
    };
  }

  async delete(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
    itemId: string,
  ) {
    const result = await this.client.personalLearningPersonaItem.deleteMany({
      where: { ...scope, id: itemId },
    });
    return result.count > 0;
  }

  async deleteAll(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
  ) {
    const result = await this.client.personalLearningPersonaItem.deleteMany({ where: scope });
    return result.count;
  }

  async listForAi(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
  ) {
    const items = await this.client.personalLearningPersonaItem.findMany({
      where: { ...scope, status: { in: ['UNCONFIRMED', 'CONFIRMED'] } },
      select: {
        attributeKey: true,
        value: true,
        status: true,
        evidenceType: true,
        evidenceId: true,
        evidenceCreatedAt: true,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    });
    return items.map((item) => ({
      ...item,
      epistemicStatus:
        item.status === 'CONFIRMED'
          ? ('LEARNER_CONFIRMED' as const)
          : ('UNCONFIRMED_GUESS' as const),
    }));
  }
}

export class PrismaPersonalLearningSavedExamplesRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  list(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
  ) {
    return this.client.personalLearningSavedExample.findMany({
      where: scope,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async save(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
    input: { title: string; content: string; sourceType: string; sourceId: string },
  ) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || title.length > 160 || !content || Buffer.byteLength(content, 'utf8') > 16_000)
      return { outcome: 'INVALID' as const };
    const membership = await this.client.groupMembership.findFirst({
      where: { ...scope, status: 'ACTIVE', serviceRole: 'PARTICIPANT' },
      select: { id: true },
    });
    if (!membership) return { outcome: 'NOT_FOUND' as const };
    return {
      outcome: 'SAVED' as const,
      item: await this.client.personalLearningSavedExample.create({
        data: { ...scope, ...input, title, content, lastLearnerUseAt: new Date() },
      }),
    };
  }

  async delete(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
    id: string,
  ) {
    const result = await this.client.personalLearningSavedExample.deleteMany({
      where: { ...scope, id },
    });
    return result.count > 0;
  }

  async touch(
    scope: Pick<DynamicLearningScope, 'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'>,
    id: string,
    at: Date,
  ) {
    const result = await this.client.personalLearningSavedExample.updateMany({
      where: { ...scope, id },
      data: { lastLearnerUseAt: at },
    });
    return result.count > 0;
  }
}

export function isPersonalLearningTopicConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)
  );
}
