import { createHash } from 'node:crypto';
import {
  AI_TRAINING_V1_MODULE_KEY,
  trainingEndRetentionEligibility,
  trainingRetentionEndDate,
  type TrainingEndDateInput,
  type TrainingEndDateListResult,
  type TrainingEndDateRepository,
  type TrainingEndDateResult,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './index';
import { lockTrainingEnrollmentData } from './training-data-lock';

const action = 'TRAINING_END_DATE_CONFIRMED';
type Confirmation = TrainingEndDateInput & { revision: string; operationId: string };
class EndDateConflict extends Error {}

type AdminScope = Pick<TrainingEndDateInput, 'workspaceId' | 'groupId' | 'actorUserId'>;
async function readAdmin(tx: Prisma.TransactionClient, input: AdminScope) {
  const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
  const admin = await tx.groupMembership.findFirst({
    where: {
      ...scope,
      userId: input.actorUserId,
      status: 'ACTIVE',
      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      user: { status: 'ACTIVE' },
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  return admin;
}

async function readOwner(tx: Prisma.TransactionClient, input: TrainingEndDateInput) {
  if (!(await readAdmin(tx, input))) return { outcome: 'FORBIDDEN' } as const;
  const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
  const enrollment = await tx.programEnrollment.findFirst({
    where: { ...scope, id: input.programEnrollmentId },
    select: { groupMembershipId: true },
  });
  if (!enrollment) return { outcome: 'NOT_FOUND' } as const;
  const member = await tx.groupMembership.findFirst({
    where: { ...scope, id: enrollment.groupMembershipId, serviceRole: 'PARTICIPANT' },
    select: { userId: true },
  });
  if (!member) return { outcome: 'NOT_FOUND' } as const;
  return { outcome: 'OWNED', member, enrollment } as const;
}

async function readCurrent(
  tx: Prisma.TransactionClient,
  input: TrainingEndDateInput,
  groupMembershipId: string,
  memberUserId: string,
) {
  const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
  const enrollment = await tx.programEnrollment.findFirst({
    where: { ...scope, id: input.programEnrollmentId, groupMembershipId },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      updatedAt: true,
      serviceProgramId: true,
    },
  });
  if (!enrollment) return null;
  const program = await tx.serviceProgram.findFirst({
    where: {
      ...scope,
      id: enrollment.serviceProgramId,
      settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY },
    },
    select: { id: true },
  });
  if (!program) return null;
  const state = await tx.trainingDataRetentionState.findFirst({
    where: { ...scope, programEnrollmentId: input.programEnrollmentId },
    select: { endedAt: true, workRedactedAt: true, progressPurgedAt: true, updatedAt: true },
  });
  return { enrollment, state, groupMembershipId, memberUserId };
}

function makePreview(
  input: TrainingEndDateInput,
  current: NonNullable<Awaited<ReturnType<typeof readCurrent>>>,
): TrainingEndDateResult {
  const { enrollment, state } = current;
  if (
    !Number.isFinite(input.now.getTime()) ||
    !Number.isFinite(input.endedAt.getTime()) ||
    input.endedAt.getUTCFullYear() < 1 ||
    input.endedAt > input.now ||
    (enrollment.startsAt && input.endedAt < enrollment.startsAt) ||
    !input.reason.trim() ||
    input.reason.length > 300
  )
    return { outcome: 'INVALID_DATE' };
  if (
    !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(enrollment.status) ||
    trainingRetentionEndDate({ ...enrollment, recordedEnd: state?.endedAt ?? null }) ||
    state?.workRedactedAt ||
    state?.progressPurgedAt
  )
    return { outcome: 'CONFLICT' };
  const eligibility = trainingEndRetentionEligibility(input.endedAt, input.now);
  const endedAt = input.endedAt.toISOString();
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        version: 'TRAINING_END_DATE_V1',
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        programEnrollmentId: input.programEnrollmentId,
        actorUserId: input.actorUserId,
        enrollment,
        state,
        groupMembershipId: current.groupMembershipId,
        memberUserId: current.memberUserId,
        endedAt,
        reason: input.reason,
        eligibility,
      }),
    )
    .digest('hex');
  return {
    outcome: 'PREVIEW',
    preview: {
      revision,
      status: enrollment.status as 'COMPLETED' | 'CANCELLED' | 'EXPIRED',
      endedAt,
      workInformationDue: eligibility.workInformationDue,
      progressAndScoresDue: eligibility.progressAndScoresDue,
    },
  };
}

export class PrismaTrainingEndDateRepository implements TrainingEndDateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  listUnresolved(input: AdminScope): Promise<TrainingEndDateListResult> {
    return this.client.$transaction(
      async (tx): Promise<TrainingEndDateListResult> => {
        if (!(await readAdmin(tx, input))) return { outcome: 'FORBIDDEN' };
        const scope = { workspaceId: input.workspaceId, groupId: input.groupId };
        const programs = await tx.serviceProgram.findMany({
          where: { ...scope, settings: { path: ['moduleKey'], equals: AI_TRAINING_V1_MODULE_KEY } },
          select: { id: true, displayName: true },
          take: 1001,
        });
        if (programs.length > 1000) return { outcome: 'TOO_LARGE' };
        const enrollments = await tx.programEnrollment.findMany({
          where: {
            ...scope,
            serviceProgramId: { in: programs.map(({ id }) => id) },
            AND: [
              {
                OR: [
                  { status: { in: ['COMPLETED', 'CANCELLED'] } },
                  { status: 'EXPIRED', endsAt: null },
                ],
              },
              {
                OR: [
                  { trainingRetention: { is: null } },
                  {
                    trainingRetention: {
                      is: {
                        endedAt: null,
                        workRedactedAt: null,
                        progressPurgedAt: null,
                      },
                    },
                  },
                ],
              },
            ],
          },
          select: {
            id: true,
            groupMembershipId: true,
            serviceProgramId: true,
            status: true,
            startsAt: true,
            updatedAt: true,
          },
          orderBy: { id: 'asc' },
          take: 101,
        });
        if (enrollments.length > 100) return { outcome: 'TOO_LARGE' };
        const rows: Extract<TrainingEndDateListResult, { outcome: 'ROWS' }>['rows'] = [];
        for (const enrollment of enrollments) {
          const member = await tx.groupMembership.findFirst({
            where: { ...scope, id: enrollment.groupMembershipId, serviceRole: 'PARTICIPANT' },
            select: { user: { select: { displayName: true } } },
          });
          if (!member) continue;
          rows.push({
            enrollmentId: enrollment.id,
            participantLabel: member.user.displayName || `参加者（${enrollment.id.slice(-8)}）`,
            programLabel: programs.find(({ id }) => id === enrollment.serviceProgramId)!
              .displayName,
            status: enrollment.status as 'COMPLETED' | 'CANCELLED' | 'EXPIRED',
            startsAt: enrollment.startsAt?.toISOString() ?? null,
            updatedAt: enrollment.updatedAt.toISOString(),
          });
        }
        return { outcome: 'ROWS', rows };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }

  preview(input: TrainingEndDateInput): Promise<TrainingEndDateResult> {
    return this.client.$transaction(
      async (tx) => {
        const owner = await readOwner(tx, input);
        if (owner.outcome !== 'OWNED') return owner;
        const current = await readCurrent(
          tx,
          input,
          owner.enrollment.groupMembershipId,
          owner.member.userId,
        );
        return current ? makePreview(input, current) : { outcome: 'NOT_FOUND' };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async confirm(input: Confirmation): Promise<TrainingEndDateResult> {
    try {
      return await this.client.$transaction(
        async (tx): Promise<TrainingEndDateResult> => {
          const owner = await readOwner(tx, input);
          if (owner.outcome !== 'OWNED') return owner;
          await lockTrainingEnrollmentData(tx, { ...input, actorUserId: owner.member.userId });
          const current = await readCurrent(
            tx,
            input,
            owner.enrollment.groupMembershipId,
            owner.member.userId,
          );
          if (!current) return { outcome: 'NOT_FOUND' };
          const auditScope = {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            resourceType: 'PROGRAM_ENROLLMENT',
            resourceId: input.programEnrollmentId,
            performedByUserId: input.actorUserId,
            action,
          };
          const prior = await tx.programAuditLog.findFirst({
            where: {
              ...auditScope,
              afterData: { path: ['operationId'], equals: input.operationId },
            },
            select: { afterData: true },
          });
          if (prior) {
            const data = prior.afterData as Record<string, unknown> | null;
            if (
              data?.['revision'] !== input.revision ||
              data?.['reason'] !== input.reason ||
              data?.['endedAt'] !== input.endedAt.toISOString() ||
              data?.['status'] !== current.enrollment.status ||
              data?.['enrollmentUpdatedAt'] !== current.enrollment.updatedAt.toISOString() ||
              current.state?.endedAt?.getTime() !== input.endedAt.getTime()
            )
              return { outcome: 'CONFLICT' };
            return { outcome: 'ALREADY_APPLIED', endedAt: input.endedAt.toISOString() };
          }
          const result = makePreview(input, current);
          if (result.outcome !== 'PREVIEW') return result;
          if (result.preview.revision !== input.revision) return { outcome: 'CONFLICT' };
          const scope = {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            programEnrollmentId: input.programEnrollmentId,
          };
          // The enrollment lock serializes this insert with lifecycle/retention writers.
          if (!current.state) await tx.trainingDataRetentionState.create({ data: { ...scope } });
          const updated = await tx.trainingDataRetentionState.updateMany({
            where: {
              ...scope,
              endedAt: null,
              workRedactedAt: null,
              progressPurgedAt: null,
              ...(current.state ? { updatedAt: current.state.updatedAt } : {}),
            },
            data: { endedAt: input.endedAt },
          });
          if (updated.count !== 1) throw new EndDateConflict('End date changed');
          await tx.programAuditLog.create({
            data: {
              ...auditScope,
              beforeData: { endedAt: null },
              afterData: {
                operationId: input.operationId,
                revision: input.revision,
                reason: input.reason,
                endedAt: input.endedAt.toISOString(),
                status: current.enrollment.status,
                enrollmentUpdatedAt: current.enrollment.updatedAt.toISOString(),
              },
              performedAt: input.now,
            },
          });
          return { outcome: 'APPLIED', endedAt: input.endedAt.toISOString() };
        },
        { isolationLevel: 'Serializable', timeout: 30000 },
      );
    } catch (error) {
      if (
        error instanceof EndDateConflict ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
      )
        return { outcome: 'CONFLICT' };
      throw error;
    }
  }
}
