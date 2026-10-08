import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_SUPPORT_SKILL_PRESENTED_EVENT,
  parseAiTrainingOperationsSettings,
  parseTrainingSupportSkillExposurePilotSettings,
  type TrainingSupportSkillPresentationV1,
  type TrainingInteractionType,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { trainingEnrollmentPeriodWhere } from './training-enrollment-period';
import { requireTrainingLearnerRole } from './personal-learning-pilot-seat';

export type TrainingInteractionWriteResult =
  | {
      outcome: 'RECORDED' | 'ALREADY_RECORDED';
      eventId: string;
      supportSkill: TrainingSupportSkillPresentationV1 | null;
    }
  | { outcome: 'NOT_FOUND' | 'CONFLICT' };

const stepsFromJson = (value: Prisma.JsonValue): readonly string[] | null =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 5 &&
  value.every((step) => typeof step === 'string' && step.length > 0 && step.length <= 200)
    ? (value as string[])
    : null;

async function loadRecordedPresentation(
  client: PrismaClient | Prisma.TransactionClient,
  input: { workspaceId: string; groupId: string; helpEventId: string },
): Promise<TrainingSupportSkillPresentationV1 | null> {
  const exposure = await client.programActionEvent.findFirst({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      eventType: TRAINING_SUPPORT_SKILL_PRESENTED_EVENT,
      sourceResourceType: 'PROGRAM_ACTION_EVENT',
      sourceResourceId: input.helpEventId,
      schemaVersion: 1,
    },
    select: { metadata: true },
  });
  if (!exposure || typeof exposure.metadata !== 'object' || Array.isArray(exposure.metadata))
    return null;
  const metadata = exposure.metadata as Record<string, unknown>;
  const skillId = metadata['trainingSupportSkillId'];
  const versionId = metadata['skillVersionId'];
  if (typeof skillId !== 'string' || typeof versionId !== 'string') return null;
  const version = await client.trainingSupportSkillVersion.findFirst({
    where: {
      id: versionId,
      trainingSupportSkillId: skillId,
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      disposition: { not: 'REVOKED' },
    },
    select: { steps: true, expectedOutput: true },
  });
  const steps = version ? stepsFromJson(version.steps) : null;
  return version && steps
    ? {
        schemaVersion: 1,
        trainingSupportSkillId: skillId,
        skillVersionId: versionId,
        steps,
        expectedOutput: version.expectedOutput,
      }
    : null;
}

async function presentEligibleSupportSkill(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    occurredAt: Date;
    enrollmentId: string;
    helpEventId: string;
    missionAssignmentId: string;
    missionDefinitionKey: string;
    assignmentVariant: string;
    programTemplateVersionId: string;
    settings: Prisma.JsonValue;
  },
): Promise<TrainingSupportSkillPresentationV1 | null> {
  const pilot = parseTrainingSupportSkillExposurePilotSettings(input.settings);
  if (!pilot.enabled) return null;
  for (const binding of pilot.bindings) {
    await tx.$queryRaw`SELECT id FROM training_support_skills
      WHERE id = ${binding.trainingSupportSkillId}::uuid
        AND workspace_id = ${input.workspaceId}::uuid
        AND group_id = ${input.groupId}::uuid
      FOR SHARE`;
  }
  const candidates = await tx.trainingSupportSkill.findMany({
    where: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programTemplateVersionId: input.programTemplateVersionId,
      missionDefinitionKey: input.missionDefinitionKey,
      assignmentVariant: input.assignmentVariant,
      operationalStatus: 'ACTIVE',
      currentVersionId: { not: null },
      OR: pilot.bindings.map((binding) => ({
        id: binding.trainingSupportSkillId,
        learningObjectiveKey: binding.learningObjectiveKey,
      })),
    },
    select: {
      id: true,
      currentVersionId: true,
      learningObjectiveKey: true,
    },
    take: 2,
  });
  if (candidates.length !== 1 || !candidates[0]?.currentVersionId) return null;
  const skill = candidates[0];
  const currentVersionId = skill.currentVersionId!;
  const [version, activation] = await Promise.all([
    tx.trainingSupportSkillVersion.findFirst({
      where: {
        id: currentVersionId,
        trainingSupportSkillId: skill.id,
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        disposition: 'ACTIVE',
      },
      select: { id: true, steps: true, expectedOutput: true },
    }),
    tx.trainingSupportSkillActivation.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        trainingSupportSkillId: skill.id,
        skillVersionId: currentVersionId,
        operation: { in: ['ACTIVATE', 'ROLLBACK'] },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    }),
  ]);
  const steps = version ? stepsFromJson(version.steps) : null;
  if (!version || !activation || !steps) return null;
  await tx.programActionEvent.create({
    data: {
      workspaceId: input.workspaceId,
      groupId: input.groupId,
      programEnrollmentId: input.enrollmentId,
      missionAssignmentId: input.missionAssignmentId,
      eventType: TRAINING_SUPPORT_SKILL_PRESENTED_EVENT,
      sourceResourceType: 'PROGRAM_ACTION_EVENT',
      sourceResourceId: input.helpEventId,
      idempotencyKey: `training-support-skill-presented:${input.helpEventId}:${version.id}`,
      schemaVersion: 1,
      metadata: {
        schemaVersion: 1,
        trainingSupportSkillId: skill.id,
        skillVersionId: version.id,
        activationId: activation.id,
        missionDefinitionKey: input.missionDefinitionKey,
        learningObjectiveKey: skill.learningObjectiveKey,
        presentedAt: input.occurredAt.toISOString(),
      },
      actorUserId: input.actorUserId,
      occurredAt: input.occurredAt,
    },
  });
  return {
    schemaVersion: 1,
    trainingSupportSkillId: skill.id,
    skillVersionId: version.id,
    steps,
    expectedOutput: version.expectedOutput,
  };
}

export class PrismaTrainingInteractionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async record(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    interactionType: TrainingInteractionType;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<TrainingInteractionWriteResult> {
    const existing = await this.findIdempotentResult(input);
    if (existing) return existing;
    try {
      return await this.client.$transaction(
        async (tx) => {
          await lockTrainingEnrollmentData(tx, input);
          const membership = await tx.groupMembership.findFirst({
            where: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              userId: input.actorUserId,
              serviceRole: { in: ['PARTICIPANT', 'SERVICE_OWNER'] },
              status: 'ACTIVE',
            },
            select: { id: true, serviceRole: true },
          });
          if (!membership) return { outcome: 'NOT_FOUND' } as const;
          const enrollment = await tx.programEnrollment.findFirst({
            where: {
              id: input.programEnrollmentId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              groupMembershipId: membership.id,
              status: 'ACTIVE',
              startsAt: { not: null },
              AND: [trainingEnrollmentPeriodWhere(new Date())],
            },
            select: { id: true, serviceProgramId: true },
          });
          if (!enrollment) return { outcome: 'NOT_FOUND' } as const;
          await requireTrainingLearnerRole(
            tx,
            {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: input.programEnrollmentId,
              userId: input.actorUserId,
            },
            membership.serviceRole,
          );
          await tx.$queryRaw`SELECT id FROM service_programs
            WHERE id = ${enrollment.serviceProgramId}::uuid
              AND workspace_id = ${input.workspaceId}::uuid
              AND group_id = ${input.groupId}::uuid
            FOR SHARE`;
          const program = await tx.serviceProgram.findFirst({
            where: {
              id: enrollment.serviceProgramId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              status: 'ACTIVE',
              settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
            },
            select: { id: true, settings: true, programTemplateVersionId: true },
          });
          if (!program) return { outcome: 'NOT_FOUND' } as const;
          const assignment = await tx.programMissionAssignment.findFirst({
            where: {
              id: input.missionAssignmentId,
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              actionMode: 'WORK',
              status: { in: ['PRESENTED', 'STARTED'] },
            },
            select: {
              id: true,
              status: true,
              missionDefinitionKey: true,
              programTemplateVersionId: true,
              variantKey: true,
            },
          });
          if (!assignment) return { outcome: 'NOT_FOUND' } as const;
          if (assignment.status === 'PRESENTED' && input.interactionType !== 'TRAINING_POSTPONED') {
            await tx.programMissionAssignment.update({
              where: { id: assignment.id },
              data: { status: 'STARTED', startedAt: input.occurredAt },
            });
          }
          const event = await tx.programActionEvent.create({
            data: {
              workspaceId: input.workspaceId,
              groupId: input.groupId,
              programEnrollmentId: enrollment.id,
              missionAssignmentId: assignment.id,
              eventType: input.interactionType,
              sourceResourceType: 'PROGRAM_MISSION_ASSIGNMENT',
              sourceResourceId: assignment.id,
              idempotencyKey: input.idempotencyKey,
              schemaVersion: 1,
              metadata: {
                missionDefinitionKey: assignment.missionDefinitionKey,
                ...(input.interactionType === 'TRAINING_POSTPONED'
                  ? {
                      remindAt: new Date(
                        input.occurredAt.getTime() +
                          parseAiTrainingOperationsSettings(program.settings)
                            .postponedReminderHours *
                            60 *
                            60 *
                            1000,
                      ).toISOString(),
                    }
                  : {}),
              },
              actorUserId: input.actorUserId,
              occurredAt: input.occurredAt,
            },
            select: { id: true },
          });
          const supportSkill =
            input.interactionType === 'HELP_REQUESTED' &&
            assignment.programTemplateVersionId === program.programTemplateVersionId
              ? await presentEligibleSupportSkill(tx, {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  actorUserId: input.actorUserId,
                  occurredAt: input.occurredAt,
                  enrollmentId: enrollment.id,
                  helpEventId: event.id,
                  missionAssignmentId: assignment.id,
                  missionDefinitionKey: assignment.missionDefinitionKey,
                  assignmentVariant: assignment.variantKey ?? 'STANDARD',
                  programTemplateVersionId: assignment.programTemplateVersionId,
                  settings: program.settings,
                })
              : null;
          return { outcome: 'RECORDED', eventId: event.id, supportSkill } as const;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2002', 'P2034'].includes(error.code)
      ) {
        throw error;
      }
      return (await this.findIdempotentResult(input)) ?? { outcome: 'CONFLICT' };
    }
  }

  private async findIdempotentResult(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programEnrollmentId: string;
    missionAssignmentId: string;
    interactionType: TrainingInteractionType;
    idempotencyKey: string;
  }): Promise<TrainingInteractionWriteResult | null> {
    const event = await this.client.programActionEvent.findUnique({
      where: {
        workspaceId_groupId_idempotencyKey: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: {
        id: true,
        programEnrollmentId: true,
        missionAssignmentId: true,
        eventType: true,
        sourceResourceType: true,
        sourceResourceId: true,
        actorUserId: true,
      },
    });
    if (!event) return null;
    return event.programEnrollmentId === input.programEnrollmentId &&
      event.missionAssignmentId === input.missionAssignmentId &&
      event.eventType === input.interactionType &&
      event.sourceResourceType === 'PROGRAM_MISSION_ASSIGNMENT' &&
      event.sourceResourceId === input.missionAssignmentId &&
      event.actorUserId === input.actorUserId
      ? {
          outcome: 'ALREADY_RECORDED',
          eventId: event.id,
          supportSkill:
            input.interactionType === 'HELP_REQUESTED'
              ? await loadRecordedPresentation(this.client, {
                  workspaceId: input.workspaceId,
                  groupId: input.groupId,
                  helpEventId: event.id,
                })
              : null,
        }
      : { outcome: 'CONFLICT' };
  }
}
