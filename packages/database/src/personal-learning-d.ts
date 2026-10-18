import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
} from '@bunshin/capability-training';
import {
  isPersonalLearningPersonaInferredKey,
  isPersonalLearningPersonaValueDisallowed,
  PERSONAL_LEARNING_PERSONA_LEARNER_KEYS,
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
  requireMultiTopic = true,
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
      (!requireMultiTopic || personalLearningFeatureEnabled(settings, 'multiTopic'))
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
    await this.client.personalLearningTopic.updateMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programEnrollmentId: scope.programEnrollmentId,
        groupMembershipId: scope.groupMembershipId,
        userId: scope.userId,
        status: 'ACTIVE',
      },
      data: { lastLearnerUseAt: new Date() },
    });
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

type PersonaAiContextItem = {
  attributeKey: string;
  value: string;
  status: 'UNCONFIRMED' | 'CONFIRMED';
  evidenceType: PersonaItemInput['evidenceType'] | 'LEARNER_INPUT';
  evidenceId: string;
  evidenceCreatedAt: Date;
  epistemicStatus: 'UNCONFIRMED_GUESS' | 'LEARNER_CONFIRMED';
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

  async profile(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return null;
    return this.client.personalLearningPersonaProfile.findUnique({
      where: {
        workspaceId_groupId_groupMembershipId: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          groupMembershipId: scope.groupMembershipId,
        },
      },
    });
  }

  async lastSuccessfulInferenceAt(scope: DynamicLearningScope) {
    const enrollment = await this.client.programEnrollment.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        id: scope.programEnrollmentId,
        groupMembershipId: scope.groupMembershipId,
      },
      select: { serviceProgramId: true },
    });
    if (!enrollment) return null;
    const rows = await this.client.personalLearningCallAdmission.findMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        serviceProgramId: enrollment.serviceProgramId,
        AND: [
          { operationContext: { path: ['operationKind'], equals: 'PERSONA_INFERENCE' } },
          {
            operationContext: {
              path: ['actorKeyHash'],
              equals: createHash('sha256').update(scope.userId).digest('hex'),
            },
          },
          {
            operationContext: {
              path: ['programEnrollmentId'],
              equals: scope.programEnrollmentId,
            },
          },
        ],
      },
      orderBy: { admittedAt: 'desc' },
      take: 50,
      select: { admittedAt: true, operationContext: true },
    });
    const matching = rows.find((row) => {
      const context = row.operationContext;
      if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
      const value = context as Record<string, unknown>;
      const measurement = value['measurement'];
      return (
        value['actorKeyHash'] === createHash('sha256').update(scope.userId).digest('hex') &&
        value['programEnrollmentId'] === scope.programEnrollmentId &&
        value['requestFinished'] === true &&
        !!measurement &&
        typeof measurement === 'object' &&
        !Array.isArray(measurement) &&
        (measurement as Record<string, unknown>)['success'] === true
      );
    });
    return matching?.admittedAt ?? null;
  }

  async saveLearnerProfile(
    scope: MemberScope,
    input: { companyName: string | null; ageBand: string | null; industryJob: string | null },
  ) {
    const ageBands = ['20代', '30代', '40代', '50代', '60代', '70代以上'];
    for (const key of PERSONAL_LEARNING_PERSONA_LEARNER_KEYS) {
      const value =
        input[
          key === 'company_name' ? 'companyName' : key === 'age_band' ? 'ageBand' : 'industryJob'
        ];
      const max = key === 'age_band' ? 20 : 80;
      if (
        value !== null &&
        (typeof value !== 'string' ||
          value.trim().length > max ||
          !value.trim() ||
          (key === 'age_band' && !ageBands.includes(value)) ||
          isPersonalLearningPersonaValueDisallowed(value))
      )
        return { outcome: 'INVALID' as const };
    }
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false)))
      return { outcome: 'NOT_FOUND' as const };
    const key = {
      workspaceId_groupId_groupMembershipId: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: scope.groupMembershipId,
      },
    };
    const profile = await this.client.personalLearningPersonaProfile.upsert({
      where: key,
      create: {
        ...memberScopeWhere(scope),
        companyName: input.companyName?.trim() || null,
        ageBand: input.ageBand,
        industryJob: input.industryJob?.trim() || null,
        lastLearnerUseAt: new Date(),
      },
      update: {
        companyName: input.companyName?.trim() || null,
        ageBand: input.ageBand,
        industryJob: input.industryJob?.trim() || null,
        lastLearnerUseAt: new Date(),
      },
    });
    return { outcome: 'SAVED' as const, profile };
  }

  async setOptIn(
    scope: MemberScope,
    input: { enabled: boolean; consentVersion?: string; deleteSavedData?: boolean },
    now = new Date(),
  ) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return null;
    if (input.enabled && !input.consentVersion?.trim()) return null;
    return this.client.$transaction(
      async (tx) => {
        const key = {
          workspaceId_groupId_groupMembershipId: {
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            groupMembershipId: scope.groupMembershipId,
          },
        };
        const existing = await tx.personalLearningPersonaProfile.findUnique({ where: key });
        if (!input.enabled && input.deleteSavedData) {
          await tx.personalLearningPersonaItem.deleteMany({ where: memberScopeWhere(scope) });
          await tx.personalLearningPersonaSuppression.deleteMany({
            where: memberScopeWhere(scope),
          });
        }
        const profile = await tx.personalLearningPersonaProfile.upsert({
          where: key,
          create: {
            ...memberScopeWhere(scope),
            optedIn: input.enabled,
            consentVersion: input.enabled ? input.consentVersion!.trim() : null,
            optedInAt: input.enabled ? now : null,
            optedOutAt: input.enabled ? null : now,
            ...(input.deleteSavedData
              ? { companyName: null, ageBand: null, industryJob: null }
              : {}),
            lastLearnerUseAt: now,
          },
          update: {
            optedIn: input.enabled,
            ...(input.enabled
              ? { consentVersion: input.consentVersion!.trim(), optedInAt: now, optedOutAt: null }
              : { optedOutAt: now }),
            ...(input.deleteSavedData
              ? { companyName: null, ageBand: null, industryJob: null }
              : {}),
            lastLearnerUseAt: now,
          },
        });
        return { profile, previouslyOptedIn: existing?.optedIn ?? false };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async dismissInvitation(scope: MemberScope, days = 30, now = new Date()) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return false;
    if (!Number.isInteger(days) || days < 1 || days > 90) return false;
    const until = new Date(now.getTime() + days * 86_400_000);
    await this.client.personalLearningPersonaProfile.upsert({
      where: {
        workspaceId_groupId_groupMembershipId: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          groupMembershipId: scope.groupMembershipId,
        },
      },
      create: { ...memberScopeWhere(scope), dismissedUntil: until, lastLearnerUseAt: now },
      update: { dismissedUntil: until, lastLearnerUseAt: now },
    });
    return true;
  }

  async list(scope: MemberScope) {
    return this.listOwned(scope);
  }

  private async listOwned(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return [];
    await this.client.personalLearningPersonaItem.updateMany({
      where: memberScopeWhere(scope),
      data: { lastLearnerUseAt: new Date() },
    });
    return this.client.personalLearningPersonaItem.findMany({
      where: memberScopeWhere(scope),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  async save(scope: MemberScope, input: PersonaItemInput) {
    const attributeKey = input.attributeKey.trim();
    const value = input.value.trim();
    if (
      !isPersonalLearningPersonaInferredKey(attributeKey) ||
      !value ||
      value.length > 1000 ||
      isPersonalLearningPersonaValueDisallowed(value)
    )
      return { outcome: 'INVALID' as const };
    const key = {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      groupMembershipId: scope.groupMembershipId,
      attributeKey,
    };
    try {
      return await this.client.$transaction(
        async (tx) => {
          const enrollment = await ownsEnabledDynamicEnrollment(scope, tx, undefined, false);
          if (!enrollment) return { outcome: 'NOT_FOUND' as const };
          const profile = await tx.personalLearningPersonaProfile.findUnique({
            where: {
              workspaceId_groupId_groupMembershipId: {
                workspaceId: scope.workspaceId,
                groupId: scope.groupId,
                groupMembershipId: scope.groupMembershipId,
              },
            },
            select: { optedIn: true },
          });
          if (!profile?.optedIn) return { outcome: 'NOT_FOUND' as const };
          const suppression = await tx.personalLearningPersonaSuppression.findUnique({
            where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
            select: { attributeKey: true },
          });
          // A suppression is a content-free tombstone. Only an explicit learner action removes it.
          if (suppression) return { outcome: 'SUPPRESSED' as const };
          const existing = await tx.personalLearningPersonaItem.findUnique({
            where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
          });
          if (existing?.status === 'REJECTED')
            return { outcome: 'REJECTED' as const, item: existing };
          if (existing) {
            const updated = await tx.personalLearningPersonaItem.updateMany({
              where: { ...memberScopeWhere(scope), id: existing.id, status: { not: 'REJECTED' } },
              data: {
                ...input,
                attributeKey,
                value,
                status: 'UNCONFIRMED',
                lastLearnerUseAt: new Date(),
              },
            });
            const item = await tx.personalLearningPersonaItem.findUnique({
              where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
            });
            return item?.status === 'REJECTED'
              ? { outcome: 'REJECTED' as const, item }
              : updated.count
                ? { outcome: 'SAVED' as const, item }
                : { outcome: 'NOT_FOUND' as const };
          }
          const item = await tx.personalLearningPersonaItem.create({
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
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2002', 'P2034'].includes(error.code)
      )
        throw error;
      const suppression = await this.client.personalLearningPersonaSuppression.findUnique({
        where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
        select: { attributeKey: true },
      });
      if (suppression) return { outcome: 'SUPPRESSED' as const };
      const raced = await this.client.personalLearningPersonaItem.findUnique({
        where: { workspaceId_groupId_groupMembershipId_attributeKey: key },
      });
      if (raced?.status === 'REJECTED') return { outcome: 'REJECTED' as const, item: raced };
      if (!raced) throw error;
      const updated = await this.client.personalLearningPersonaItem.updateMany({
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
        : updated.count
          ? { outcome: 'SAVED' as const, item }
          : { outcome: 'NOT_FOUND' as const };
    }
  }

  async review(
    scope: MemberScope,
    itemId: string,
    input: { value?: string; status?: 'CONFIRMED' | 'REJECTED' },
  ) {
    if (input.value !== undefined && (!input.value.trim() || input.value.length > 1000))
      return { outcome: 'INVALID' as const };
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false)))
      return { outcome: 'NOT_FOUND' as const };
    if (input.value !== undefined && isPersonalLearningPersonaValueDisallowed(input.value))
      return { outcome: 'INVALID' as const };
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
    return this.client.$transaction(
      async (tx) => {
        if (!(await ownsEnabledDynamicEnrollment(scope, tx, undefined, false))) return false;
        const item = await tx.personalLearningPersonaItem.findFirst({
          where: { ...memberScopeWhere(scope), id: itemId },
          select: { attributeKey: true },
        });
        if (!item) return false;
        await tx.personalLearningPersonaItem.deleteMany({
          where: { ...memberScopeWhere(scope), id: itemId },
        });
        await tx.personalLearningPersonaSuppression.upsert({
          where: {
            workspaceId_groupId_groupMembershipId_attributeKey: {
              workspaceId: scope.workspaceId,
              groupId: scope.groupId,
              groupMembershipId: scope.groupMembershipId,
              attributeKey: item.attributeKey,
            },
          },
          create: { ...memberScopeWhere(scope), attributeKey: item.attributeKey },
          update: {},
        });
        return true;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async listSuppressedAttributes(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return [];
    const suppressions = await this.client.personalLearningPersonaSuppression.findMany({
      where: memberScopeWhere(scope),
      select: { attributeKey: true },
      orderBy: [{ createdAt: 'desc' }, { attributeKey: 'asc' }],
    });
    return suppressions.map(({ attributeKey }) => attributeKey);
  }

  async allowReinference(scope: MemberScope, attributeKey: string) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return false;
    const result = await this.client.personalLearningPersonaSuppression.deleteMany({
      where: { ...memberScopeWhere(scope), attributeKey },
    });
    return result.count > 0;
  }

  async deleteAll(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return 0;
    const result = await this.client.personalLearningPersonaItem.deleteMany({
      where: memberScopeWhere(scope),
    });
    return result.count;
  }

  /** Bounded D-3 intake source; it does not call or connect to an AI provider. */
  async listForAi(scope: MemberScope): Promise<PersonaAiContextItem[]> {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client, undefined, false))) return [];
    const profile = await this.client.personalLearningPersonaProfile.findUnique({
      where: {
        workspaceId_groupId_groupMembershipId: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          groupMembershipId: scope.groupMembershipId,
        },
      },
      select: {
        optedIn: true,
        companyName: true,
        ageBand: true,
        industryJob: true,
        updatedAt: true,
      },
    });
    if (!profile?.optedIn) return [];
    await this.client.personalLearningPersonaProfile.updateMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        groupMembershipId: scope.groupMembershipId,
        userId: scope.userId,
        optedIn: true,
      },
      data: { lastLearnerUseAt: new Date() },
    });
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
      take: 17,
    });
    const inferred = items.flatMap((item): PersonaAiContextItem[] => {
      if (
        !isPersonalLearningPersonaInferredKey(item.attributeKey) ||
        isPersonalLearningPersonaValueDisallowed(item.value)
      )
        return [];
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
    const manual = [
      ['company_name', profile.companyName],
      ['age_band', profile.ageBand],
      ['industry_job', profile.industryJob],
    ].flatMap(([attributeKey, value]) =>
      typeof value === 'string' && value && !isPersonalLearningPersonaValueDisallowed(value)
        ? [
            {
              attributeKey: attributeKey as string,
              value,
              status: 'CONFIRMED' as const,
              evidenceType: 'LEARNER_INPUT' as const,
              evidenceId: '',
              evidenceCreatedAt: profile.updatedAt,
              epistemicStatus: 'LEARNER_CONFIRMED' as const,
            },
          ]
        : [],
    );
    return [...manual, ...inferred].slice(0, 20);
  }
}

export class PrismaPersonalLearningSavedExamplesRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  list(scope: MemberScope) {
    return this.listOwned(scope);
  }

  private async listOwned(scope: MemberScope) {
    if (!(await ownsEnabledDynamicEnrollment(scope, this.client))) return [];
    await this.client.personalLearningSavedExample.updateMany({
      where: memberScopeWhere(scope),
      data: { lastLearnerUseAt: new Date() },
    });
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
