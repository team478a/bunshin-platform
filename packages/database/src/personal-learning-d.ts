import { Prisma, type PrismaClient } from '@prisma/client';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
} from '@bunshin/capability-training';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';

export type DynamicLearningScope = {
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  groupMembershipId: string;
  userId: string;
};

type MemberScope = Pick<
  DynamicLearningScope,
  'workspaceId' | 'groupId' | 'groupMembershipId' | 'userId'
>;

function memberScopeWhere(scope: MemberScope) {
  return {
    workspaceId: scope.workspaceId,
    groupId: scope.groupId,
    groupMembershipId: scope.groupMembershipId,
    userId: scope.userId,
  };
}

/** New D tables are never touched until an owned active dynamic enrollment has the opt-in flag. */
async function ownsEnabledDynamicEnrollment(
  scope: MemberScope,
  client: PrismaClient | Prisma.TransactionClient,
  enrollmentId?: string,
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
  const enrollments = await client.programEnrollment.findMany({
    where: {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      groupMembershipId: scope.groupMembershipId,
      status: 'ACTIVE',
      ...(enrollmentId ? { id: enrollmentId } : {}),
    },
    select: { id: true, serviceProgramId: true },
  });
  const programs = await client.serviceProgram.findMany({
    where: {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      id: { in: enrollments.map(({ serviceProgramId }) => serviceProgramId) },
    },
    select: { id: true, settings: true },
  });
  const settingsByProgramId = new Map(programs.map(({ id, settings }) => [id, settings]));
  for (const enrollment of enrollments) {
    const settings = settingsByProgramId.get(enrollment.serviceProgramId);
    if (
      settings &&
      personalLearningDynamicProgramAllows(settings, enrollment.id) &&
      personalLearningFeatureEnabled(settings, 'multiTopic')
    )
      return enrollment;
  }
  return null;
}

export class PrismaPersonalLearningTopicRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(scope: DynamicLearningScope) {
    const enrollment = await ownsEnabledDynamicEnrollment(
      scope,
      this.client,
      scope.programEnrollmentId,
    );
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
        const enrollment = await ownsEnabledDynamicEnrollment(scope, tx, scope.programEnrollmentId);
        if (!enrollment) return { outcome: 'NOT_FOUND' as const };
        const program = await tx.serviceProgram.findFirst({
          where: {
            id: enrollment.serviceProgramId,
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
          },
          select: { settings: true },
        });
        if (!personalLearningFeatureEnabled(program?.settings, 'multiTopic'))
          return { outcome: 'NOT_FOUND' as const };
        const topicLimit = 3;
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
        if (activeCount === 0) {
          // When an enrollment entered the legacy single-theme flow after the D-1 migration,
          // adopt its existing rows into this first theme before exposing the topic-scoped flow.
          const legacyScope = {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            programEnrollmentId: scope.programEnrollmentId,
            groupMembershipId: scope.groupMembershipId,
          };
          await tx.personalLearningRequest.updateMany({
            where: { ...legacyScope, userId: scope.userId, topicId: null },
            data: { topicId: topic.id },
          });
          await tx.personalLearningGoalConfirmation.updateMany({
            where: { ...legacyScope, userId: scope.userId, topicId: null },
            data: { topicId: topic.id },
          });
          await tx.personalLearningPlanRevision.updateMany({
            where: { ...legacyScope, userId: scope.userId, topicId: null },
            data: { topicId: topic.id },
          });
          await tx.$executeRaw`
            UPDATE program_mission_assignments a
            SET display_snapshot = jsonb_set(
              COALESCE(a.display_snapshot, '{}'::jsonb),
              '{dynamicPractice,topicId}',
              to_jsonb(${topic.id}::text),
              true
            )
            FROM personal_learning_plan_revisions p
            WHERE p.workspace_id = ${scope.workspaceId}::uuid
              AND p.group_id = ${scope.groupId}::uuid
              AND p.program_enrollment_id = ${scope.programEnrollmentId}::uuid
              AND p.group_membership_id = ${scope.groupMembershipId}::uuid
              AND p.user_id = ${scope.userId}::uuid
              AND p.topic_id = ${topic.id}::uuid
              AND a.workspace_id = p.workspace_id
              AND a.group_id = p.group_id
              AND a.program_enrollment_id = p.program_enrollment_id
              AND a.target_resource_type = 'PERSONAL_LEARNING_PLAN'
              AND a.target_resource_id = p.plan_id
              AND a.display_snapshot ? 'dynamicPractice'
          `;
          await tx.$executeRaw`
            UPDATE program_action_events e
            SET metadata = jsonb_set(COALESCE(e.metadata, '{}'::jsonb), '{topicId}', to_jsonb(${topic.id}::text), true)
            FROM personal_learning_requests r
            WHERE r.workspace_id = ${scope.workspaceId}::uuid
              AND r.group_id = ${scope.groupId}::uuid
              AND r.program_enrollment_id = ${scope.programEnrollmentId}::uuid
              AND r.group_membership_id = ${scope.groupMembershipId}::uuid
              AND r.user_id = ${scope.userId}::uuid
              AND r.topic_id = ${topic.id}::uuid
              AND e.workspace_id = r.workspace_id
              AND e.group_id = r.group_id
              AND e.program_enrollment_id = r.program_enrollment_id
              AND e.metadata->>'threadId' = r.id::text
              AND e.event_type IN (
                'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
                'PERSONAL_LEARNING_CONVERSATION_RESPONSE',
                'PERSONAL_LEARNING_CONVERSATION_SHARE'
              )
          `;
        }
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
        if (!(await ownsEnabledDynamicEnrollment(scope, tx, scope.programEnrollmentId)))
          return null;
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
          if (!personalLearningFeatureEnabled(program?.settings, 'multiTopic'))
            return { outcome: 'NOT_FOUND' as const };
          if (active >= 3) return { outcome: 'LIMIT_REACHED' as const };
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
}

export type PersonaItemInput = {
  attributeKey: string;
  value: string;
  evidenceType: 'CONVERSATION_EVENT' | 'PRACTICE_ANSWER' | 'LEARNING_REQUEST';
  evidenceId: string;
  evidenceCreatedAt: Date;
};

function personaEvidenceType(value: string): PersonaItemInput['evidenceType'] | null {
  switch (value) {
    case 'CONVERSATION_EVENT':
    case 'PRACTICE_ANSWER':
    case 'LEARNING_REQUEST':
      return value;
    default:
      return null;
  }
}

/** Every operation is bound to the active member in one Workspace + Service (Group) + User. */
export class PrismaPersonalLearningPersonaRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(scope: MemberScope) {
    return this.listOwned(scope);
  }

  private async listOwned(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return [];
    return this.client.personalLearningPersonaItem.findMany({
      where: memberScopeWhere(scope),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async save(scope: MemberScope, input: PersonaItemInput) {
    const attributeKey = input.attributeKey.trim();
    const value = input.value.trim();
    if (!attributeKey || attributeKey.length > 80 || !value || value.length > 1000)
      return { outcome: 'INVALID' as const };
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client)))
      return { outcome: 'NOT_FOUND' as const };
    const key = {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      groupMembershipId: scope.groupMembershipId,
      attributeKey,
    };
    const existing = await this.client.personalLearningPersonaItem.findUnique({
      where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
    });
    if (existing?.status === 'REJECTED') return { outcome: 'REJECTED' as const, item: existing };
    if (existing) {
      const updated = await this.client.personalLearningPersonaItem.updateMany({
        where: { ...memberScopeWhere(scope), id: existing.id, status: { not: 'REJECTED' } },
        data: {
          ...input,
          attributeKey,
          value,
          status: 'UNCONFIRMED',
          lastLearnerUseAt: new Date(),
        },
      });
      const item = await this.client.personalLearningPersonaItem.findUnique({
        where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
      });
      return item?.status === 'REJECTED'
        ? { outcome: 'REJECTED' as const, item }
        : updated.count
          ? { outcome: 'SAVED' as const, item }
          : { outcome: 'NOT_FOUND' as const };
    }
    try {
      const item = await this.client.personalLearningPersonaItem.create({
        data: {
          ...memberScopeWhere(scope),
          ...input,
          attributeKey,
          value,
          status: 'UNCONFIRMED',
          lastLearnerUseAt: new Date(),
        },
      });
      return { outcome: 'SAVED' as const, item };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const raced = await this.client.personalLearningPersonaItem.findUnique({
        where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
      });
      if (raced?.status === 'REJECTED') return { outcome: 'REJECTED' as const, item: raced };
      if (!raced) throw error;
      await this.client.personalLearningPersonaItem.updateMany({
        where: { ...memberScopeWhere(scope), id: raced.id, status: { not: 'REJECTED' } },
        data: {
          ...input,
          attributeKey,
          value,
          status: 'UNCONFIRMED',
          lastLearnerUseAt: new Date(),
        },
      });
      const item = await this.client.personalLearningPersonaItem.findUnique({
        where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
      });
      return item?.status === 'REJECTED'
        ? { outcome: 'REJECTED' as const, item }
        : { outcome: 'SAVED' as const, item };
    }
  }

  async review(
    scope: MemberScope,
    itemId: string,
    input: { value?: string; status?: 'CONFIRMED' | 'REJECTED' },
  ) {
    if (input.value !== undefined && (!input.value.trim() || input.value.length > 1000))
      return { outcome: 'INVALID' as const };
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client)))
      return { outcome: 'NOT_FOUND' as const };
    const result = await this.client.personalLearningPersonaItem.updateMany({
      where: { ...memberScopeWhere(scope), id: itemId },
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
        where: { ...memberScopeWhere(scope), id: itemId },
      }),
    };
  }

  async delete(scope: MemberScope, itemId: string) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return false;
    const result = await this.client.personalLearningPersonaItem.deleteMany({
      where: { ...memberScopeWhere(scope), id: itemId },
    });
    return result.count > 0;
  }

  async deleteAll(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return 0;
    const result = await this.client.personalLearningPersonaItem.deleteMany({
      where: memberScopeWhere(scope),
    });
    return result.count;
  }

  /** Bounded D-3 intake source; it does not call or connect to an AI provider. */
  async listForAi(scope: MemberScope): Promise<
    Array<{
      attributeKey: string;
      value: string;
      status: 'UNCONFIRMED' | 'CONFIRMED';
      evidenceType: PersonaItemInput['evidenceType'];
      evidenceId: string;
      evidenceCreatedAt: Date;
      epistemicStatus: 'UNCONFIRMED_GUESS' | 'LEARNER_CONFIRMED';
    }>
  > {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return [];
    const items = await this.client.personalLearningPersonaItem.findMany({
      where: { ...memberScopeWhere(scope), status: { in: ['UNCONFIRMED', 'CONFIRMED'] } },
      select: {
        attributeKey: true,
        value: true,
        status: true,
        evidenceType: true,
        evidenceId: true,
        evidenceCreatedAt: true,
      },
      // Confirmed facts are more reliable; within each status, prefer recently reviewed/inferred.
      orderBy: [
        { status: 'asc' },
        { updatedAt: 'desc' },
        { evidenceCreatedAt: 'desc' },
        { id: 'asc' },
      ],
      take: 20,
    });
    return items.flatMap((item) => {
      if (item.status !== 'CONFIRMED' && item.status !== 'UNCONFIRMED') return [];
      const evidenceType = personaEvidenceType(item.evidenceType);
      if (!evidenceType) return [];
      return [
        {
          ...item,
          status: item.status,
          evidenceType,
          epistemicStatus:
            item.status === 'CONFIRMED'
              ? ('LEARNER_CONFIRMED' as const)
              : ('UNCONFIRMED_GUESS' as const),
        },
      ];
    });
  }
}

export class PrismaPersonalLearningSavedExamplesRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  list(scope: MemberScope) {
    return this.listOwned(scope);
  }

  private async listOwned(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return [];
    return this.client.personalLearningSavedExample.findMany({
      where: memberScopeWhere(scope),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async save(
    scope: MemberScope,
    input: { title: string; content: string; sourceType: string; sourceId: string },
  ) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || title.length > 160 || !content || Buffer.byteLength(content, 'utf8') > 16_000)
      return { outcome: 'INVALID' as const };
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client)))
      return { outcome: 'NOT_FOUND' as const };
    return {
      outcome: 'SAVED' as const,
      item: await this.client.personalLearningSavedExample.create({
        data: {
          ...memberScopeWhere(scope),
          ...input,
          title,
          content,
          lastLearnerUseAt: new Date(),
        },
      }),
    };
  }

  async delete(scope: MemberScope, id: string) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return false;
    const result = await this.client.personalLearningSavedExample.deleteMany({
      where: { ...memberScopeWhere(scope), id },
    });
    return result.count > 0;
  }

  async touch(scope: MemberScope, id: string, at: Date) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return false;
    const result = await this.client.personalLearningSavedExample.updateMany({
      where: { ...memberScopeWhere(scope), id },
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
