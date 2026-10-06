import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import type { PersonalLearningPreparationAuthority } from '@bunshin/application';
import { requirePersonalLearningPreparationAuthority } from './personal-learning-preparation-authority';
import {
  AI_TRAINING_LEARNING_CATALOG_VERSION,
  personalLearningPilotProfilePreparationAllows,
} from '@bunshin/capability-training';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { trainingEnrollmentPeriodWhere } from './training-enrollment-period';

export interface PersonalLearningPilotProfileScope {
  workspaceId: string;
  groupId: string;
  programEnrollmentId: string;
  actorUserId: string;
}
export interface PersonalLearningPilotProfileCommand {
  operationId: string;
  role: 'SALES' | 'OFFICE' | 'MANAGER' | 'OTHER';
  aiLevel: 'BEGINNER' | 'INTERMEDIATE';
  dailyMinutes: 5 | 10 | 15;
  confirmation: 'CONFIRM_MY_LEARNING_PROFILE';
  expectedAbsent: true;
}
const select = {
  id: true,
  role: true,
  aiLevel: true,
  dailyMinutes: true,
  updatedByUserId: true,
} as const;
const eventType = 'PERSONAL_LEARNING_PILOT_PROFILE_INITIALIZED';
const uuid = (s: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
function conflict(): never {
  throw new ApplicationError('CONFLICT', 'profile initialization changed or already completed');
}
function denied(): never {
  throw new ApplicationError('NOT_FOUND', 'profile preparation unavailable');
}
export function validatePersonalLearningPilotProfileCommand(
  c: PersonalLearningPilotProfileCommand,
) {
  if (
    !c ||
    Object.keys(c).some(
      (k) =>
        ![
          'operationId',
          'role',
          'aiLevel',
          'dailyMinutes',
          'confirmation',
          'expectedAbsent',
        ].includes(k),
    ) ||
    !uuid(c.operationId) ||
    !['SALES', 'OFFICE', 'MANAGER', 'OTHER'].includes(c.role) ||
    !['BEGINNER', 'INTERMEDIATE'].includes(c.aiLevel) ||
    ![5, 10, 15].includes(c.dailyMinutes) ||
    c.confirmation !== 'CONFIRM_MY_LEARNING_PROFILE' ||
    c.expectedAbsent !== true
  )
    throw new ApplicationError('VALIDATION_ERROR', 'explicit learner profile answers required');
  return {
    operationId: c.operationId,
    role: c.role,
    aiLevel: c.aiLevel,
    dailyMinutes: c.dailyMinutes,
    confirmation: c.confirmation,
    expectedAbsent: c.expectedAbsent,
  };
}
export class PrismaPersonalLearningPilotProfileRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly now = () => new Date(),
    private readonly preparationAuthority?: PersonalLearningPreparationAuthority,
  ) {}
  private async authorized<T>(
    s: PersonalLearningPilotProfileScope,
    write: boolean,
    work: (tx: Prisma.TransactionClient, membershipId: string, now: Date) => Promise<T>,
  ): Promise<T> {
    if (![s.workspaceId, s.groupId, s.programEnrollmentId, s.actorUserId].every(uuid)) denied();
    try {
      return await this.client.$transaction(
        async (tx) => {
          if (write) await lockTrainingEnrollmentData(tx, s);
          else
            await tx.$queryRaw`SELECT e.id FROM program_enrollments e JOIN group_memberships m
          ON m.id=e.group_membership_id AND m.workspace_id=e.workspace_id AND m.group_id=e.group_id
          WHERE e.id=${s.programEnrollmentId}::uuid AND e.workspace_id=${s.workspaceId}::uuid
          AND e.group_id=${s.groupId}::uuid AND m.user_id=${s.actorUserId}::uuid FOR SHARE OF e`;
          const members = await tx.$queryRaw<{ id: string }[]>`
          SELECT m.id FROM group_memberships m JOIN users u ON u.id=m.user_id
          JOIN groups g ON g.id=m.group_id AND g.workspace_id=m.workspace_id
          JOIN workspaces w ON w.id=g.workspace_id
          WHERE m.workspace_id=${s.workspaceId}::uuid AND m.group_id=${s.groupId}::uuid AND m.user_id=${s.actorUserId}::uuid
            AND m.status::text='ACTIVE' AND m.service_role::text='PARTICIPANT'
            AND u.status::text='ACTIVE' AND g.status::text='ACTIVE' AND w.status::text='ACTIVE' FOR SHARE OF m,u,g,w`;
          const member = members[0];
          if (!member || members.length !== 1) denied();
          const now = this.now();
          const enrollment = await tx.programEnrollment.findFirst({
            where: {
              id: s.programEnrollmentId,
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              groupMembershipId: member.id,
              status: 'ACTIVE',
              AND: [trainingEnrollmentPeriodWhere(now)],
            },
            select: { serviceProgramId: true },
          });
          if (!enrollment) denied();
          if (this.preparationAuthority)
            await requirePersonalLearningPreparationAuthority(
              tx,
              this.preparationAuthority,
              s,
              enrollment.serviceProgramId,
            );
          const programs = await tx.$queryRaw<{ settings: unknown }[]>`
          SELECT settings FROM service_programs WHERE id=${enrollment.serviceProgramId}::uuid
            AND workspace_id=${s.workspaceId}::uuid AND group_id=${s.groupId}::uuid
            AND status::text='SUSPENDED' AND settings->>'moduleKey'='AI_TRAINING_V1' FOR SHARE`;
          const settings = programs[0]?.settings;
          if (
            programs.length !== 1 ||
            !personalLearningPilotProfilePreparationAllows(settings, s.programEnrollmentId)
          )
            denied();
          const scope = {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            programEnrollmentId: s.programEnrollmentId,
          };
          const deleted = await tx.programAuditLog.findFirst({
            where: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              resourceType: 'PROGRAM_ENROLLMENT',
              resourceId: s.programEnrollmentId,
              action: 'TRAINING_PERSONAL_DATA_DELETED',
              afterData: { path: ['kind'], equals: 'ALL' },
            },
            select: { id: true },
          });
          if (deleted) denied();
          // This is not a migration from an existing course, nor an edit of a live learner.
          if (
            (await tx.programMemberGoal.count({ where: scope })) ||
            (await tx.programMissionAssignment.count({ where: scope }))
          )
            conflict();
          return work(tx, member.id, now);
        },
        { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        conflict();
      throw error;
    }
  }
  read(s: PersonalLearningPilotProfileScope) {
    return this.authorized(s, false, async (tx, membershipId) => ({
      profile: await tx.trainingParticipantProfile.findFirst({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          groupMembershipId: membershipId,
          userId: s.actorUserId,
        },
        select,
      }),
    }));
  }
  initialize(s: PersonalLearningPilotProfileScope, command: PersonalLearningPilotProfileCommand) {
    const c = validatePersonalLearningPilotProfileCommand(command);
    return this.authorized(s, true, async (tx, membershipId, now) => {
      const scope = {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        groupMembershipId: membershipId,
        userId: s.actorUserId,
      };
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ scope, command: c }))
        .digest('hex');
      const key = `PERSONAL_LEARNING_PILOT_PROFILE_INIT_${c.operationId}`;
      const prior = await tx.programActionEvent.findUnique({
        where: {
          workspaceId_groupId_idempotencyKey: {
            workspaceId: s.workspaceId,
            groupId: s.groupId,
            idempotencyKey: key,
          },
        },
      });
      const profile = await tx.trainingParticipantProfile.findFirst({ where: scope, select });
      if (prior) {
        const metadata = prior.metadata as { fingerprint?: string };
        if (
          prior.programEnrollmentId !== s.programEnrollmentId ||
          prior.actorUserId !== s.actorUserId ||
          prior.eventType !== eventType ||
          prior.sourceResourceType !== 'TRAINING_PARTICIPANT_PROFILE' ||
          !profile ||
          prior.sourceResourceId !== profile.id ||
          metadata.fingerprint !== fingerprint ||
          profile.role !== c.role ||
          profile.aiLevel !== c.aiLevel ||
          profile.dailyMinutes !== c.dailyMinutes
        )
          conflict();
        return { outcome: 'ALREADY_INITIALIZED' as const, profile };
      }
      // Enrollment-level unique is the absence CAS; never upsert over another profile/scope.
      if (
        await tx.trainingParticipantProfile.count({
          where: { programEnrollmentId: s.programEnrollmentId },
        })
      )
        conflict();
      const created = await tx.trainingParticipantProfile.create({
        data: {
          ...scope,
          role: c.role,
          aiLevel: c.aiLevel,
          dailyMinutes: c.dailyMinutes,
          learningGoalKey: null,
          assessmentVersion: AI_TRAINING_LEARNING_CATALOG_VERSION,
          updatedByUserId: s.actorUserId,
        },
        select,
      });
      await tx.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          actorUserId: s.actorUserId,
          eventType,
          sourceResourceType: 'TRAINING_PARTICIPANT_PROFILE',
          sourceResourceId: created.id,
          idempotencyKey: key,
          schemaVersion: 1,
          metadata: {
            contractVersion: 'PERSONAL_LEARNING_PILOT_PROFILE_V1',
            fingerprint,
            confirmation: c.confirmation,
          },
          occurredAt: now,
        },
      });
      return { outcome: 'INITIALIZED' as const, profile: created };
    });
  }
}
