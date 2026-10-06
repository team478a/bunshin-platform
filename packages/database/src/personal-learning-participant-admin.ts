import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { PersonalLearningPreparationAuthority } from '@bunshin/application';
import {
  parsePilotParticipantPolicy,
  PILOT_PARTICIPANT_CAP_VERSION,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { requirePersonalLearningPreparationAuthority } from './personal-learning-preparation-authority';
import { pilotParticipantHash } from './personal-learning-pilot-seat';

export type PilotParticipantCommand = Readonly<{
  operationId: string;
  expectedRevision: number;
  confirmation: 'CONFIRM_PILOT_PARTICIPANT_OPERATION';
  reviewEvidenceKey: string;
}> &
  (
    | {
        action: 'CONFIGURE';
        externalParticipantCap: number;
        internalParticipantCap: number;
        currentWave: number;
      }
    | { action: 'ADMIT'; programEnrollmentId: string; kind: 'INTERNAL' | 'EXTERNAL' }
    | { action: 'REVOKE'; programEnrollmentId: string }
  );
const unavailable = () => new ApplicationError('NOT_FOUND', 'pilot preparation unavailable');
const rejected = (reason: string) => new ApplicationError('CONFLICT', reason);
const uuid = (v: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);

/** Trusted operation only. Does not create Enrollment, approve Definitions, or enable Pilot. */
export class PrismaPersonalLearningParticipantAdminRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly authority: PersonalLearningPreparationAuthority,
  ) {}
  private async authorized<T>(
    actorUserId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (!uuid(actorUserId)) throw unavailable();
    try {
      return await this.client.$transaction(
        async (tx) => {
          const a = this.authority;
          // Same Group -> Program lock order as existing preparation operations.
          const groups = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM groups WHERE id=${a.groupId}::uuid AND workspace_id=${a.workspaceId}::uuid AND status::text='ACTIVE' FOR UPDATE`;
          const admins = await tx.$queryRaw<
            { id: string }[]
          >`SELECT m.id FROM group_memberships m JOIN users u ON u.id=m.user_id JOIN workspaces w ON w.id=m.workspace_id
          WHERE m.workspace_id=${a.workspaceId}::uuid AND m.group_id=${a.groupId}::uuid AND m.user_id=${actorUserId}::uuid
          AND m.status::text='ACTIVE' AND m.service_role::text IN ('SERVICE_OWNER','SERVICE_ADMIN')
          AND u.status::text='ACTIVE' AND w.status::text='ACTIVE' FOR SHARE OF m,u,w`;
          if (groups.length !== 1 || admins.length !== 1) throw unavailable();
          await tx.$queryRaw`SELECT id FROM service_programs WHERE id=${a.serviceProgramId}::uuid AND workspace_id=${a.workspaceId}::uuid AND group_id=${a.groupId}::uuid FOR UPDATE`;
          await requirePersonalLearningPreparationAuthority(tx, a, a, a.serviceProgramId, true);
          return work(tx);
        },
        { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(e.code))
        throw rejected('PILOT_CONCURRENT_OPERATION');
      throw e;
    }
  }
  read(actorUserId: string) {
    return this.authorized(actorUserId, async (tx) => {
      const a = this.authority;
      const program = await tx.serviceProgram.findUniqueOrThrow({
        where: { id: a.serviceProgramId },
      });
      const settings = program.settings as {
        personalLearningPilot: { participantControl?: unknown };
      };
      return {
        policy: parsePilotParticipantPolicy(settings.personalLearningPilot.participantControl),
        seats: await tx.personalLearningPilotSeat.findMany({
          where: a,
          select: {
            programEnrollmentId: true,
            kind: true,
            cohort: true,
            seatNumber: true,
            admittedAt: true,
            revokedAt: true,
          },
        }),
      };
    });
  }
  change(actorUserId: string, command: PilotParticipantCommand) {
    const keys = [
      'operationId',
      'expectedRevision',
      'confirmation',
      'reviewEvidenceKey',
      'action',
      ...(command.action === 'CONFIGURE'
        ? ['externalParticipantCap', 'internalParticipantCap', 'currentWave']
        : command.action === 'ADMIT'
          ? ['programEnrollmentId', 'kind']
          : ['programEnrollmentId']),
    ];
    if (
      !uuid(command.operationId) ||
      command.confirmation !== 'CONFIRM_PILOT_PARTICIPANT_OPERATION' ||
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 0 ||
      typeof command.reviewEvidenceKey !== 'string' ||
      !/^[a-zA-Z0-9_.:-]{1,100}$/.test(command.reviewEvidenceKey) ||
      Object.keys(command).length !== keys.length ||
      Object.keys(command).some((k) => !keys.includes(k))
    )
      throw new ApplicationError('VALIDATION_ERROR', 'valid reviewed operation required');
    if (
      command.action !== 'CONFIGURE' &&
      (!uuid(command.programEnrollmentId) || !['ADMIT', 'REVOKE'].includes(command.action))
    )
      throw unavailable();
    if (command.action === 'ADMIT' && !['INTERNAL', 'EXTERNAL'].includes(command.kind))
      throw unavailable();
    const digest = createHash('sha256')
      .update(
        JSON.stringify(
          Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b))),
        ),
      )
      .digest('hex');
    return this.authorized(actorUserId, async (tx) => {
      const a = this.authority;
      const program = await tx.serviceProgram.findUniqueOrThrow({
        where: { id: a.serviceProgramId },
      });
      const settings = program.settings as Prisma.JsonObject;
      const pilot = settings.personalLearningPilot as Prisma.JsonObject;
      const policy = parsePilotParticipantPolicy(pilot.participantControl);
      const seats = await tx.personalLearningPilotSeat.findMany({ where: a });
      const activeIds = seats.filter((s) => !s.revokedAt).map((s) => s.programEnrollmentId);
      const ids = pilot.enrollmentIds;
      // No automatic adoption/backfill of the old allowlist.
      if (
        !Array.isArray(ids) ||
        ids.length !== activeIds.length ||
        activeIds.some((id) => !id || !ids.includes(id))
      )
        throw rejected('PILOT_SEAT_PROJECTION_MISMATCH');
      const auditKey = `PILOT_PARTICIPANT_${command.operationId}`;
      const prior = await tx.programAuditLog.findFirst({
        where: {
          workspaceId: a.workspaceId,
          groupId: a.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: a.serviceProgramId,
          action: auditKey,
        },
      });
      if (prior) {
        const data = prior.afterData as { digest?: string; revision?: number; reason?: string };
        if (prior.performedByUserId !== actorUserId || data.digest !== digest)
          throw rejected('PILOT_OPERATION_CONFLICT');
        if (
          command.action === 'ADMIT' &&
          !seats.some((s) => s.programEnrollmentId === command.programEnrollmentId && !s.revokedAt)
        )
          throw rejected('PARTICIPANT_REVOKED');
        return { replayed: true, revision: data.revision ?? 0, reason: data.reason };
      }
      if ((policy?.revision ?? 0) !== command.expectedRevision)
        throw rejected('PILOT_REVISION_CHANGED');
      let nextPolicy = policy;
      let reason = 'PILOT_WAVE_CONFIGURED';
      if (command.action === 'CONFIGURE') {
        nextPolicy = parsePilotParticipantPolicy({
          version: PILOT_PARTICIPANT_CAP_VERSION,
          revision: command.expectedRevision + 1,
          externalParticipantCap: command.externalParticipantCap,
          internalParticipantCap: command.internalParticipantCap,
          currentWave: command.currentWave,
          currentWaveCap: [0, 5, 20, 50, 100][command.currentWave],
        });
        if (
          !nextPolicy ||
          seats.filter((s) => s.kind === 'EXTERNAL').length > nextPolicy.currentWaveCap ||
          seats.filter((s) => s.kind === 'EXTERNAL').length > nextPolicy.externalParticipantCap ||
          seats.filter((s) => s.kind === 'INTERNAL').length > nextPolicy.internalParticipantCap
        )
          throw rejected('PILOT_CAP_CONFIGURATION_INVALID');
      } else {
        if (!policy) throw rejected('PREPARATION_REQUIRED');
        const enrollment = await tx.programEnrollment.findFirst({
          where: {
            id: command.programEnrollmentId,
            workspaceId: a.workspaceId,
            groupId: a.groupId,
            serviceProgramId: a.serviceProgramId,
          },
        });
        if (!enrollment) throw unavailable();
        const member = await tx.groupMembership.findFirst({
          where: {
            id: enrollment.groupMembershipId,
            workspaceId: a.workspaceId,
            groupId: a.groupId,
            serviceRole: 'PARTICIPANT',
            ...(command.action === 'ADMIT' ? { status: 'ACTIVE' as const } : {}),
          },
        });
        if (!member) throw unavailable();
        const hash = pilotParticipantHash(a.serviceProgramId, member.userId);
        const priorSeat = seats.find((s) => s.participantHash === hash);
        if (command.action === 'REVOKE') {
          if (!priorSeat || priorSeat.programEnrollmentId !== enrollment.id) throw unavailable();
          if (!priorSeat.revokedAt)
            await tx.personalLearningPilotSeat.update({
              where: { id: priorSeat.id },
              data: { revokedAt: new Date() },
            });
          reason = 'PARTICIPANT_REVOKED';
        } else {
          if (priorSeat?.revokedAt) throw rejected('PARTICIPANT_REVOKED');
          if (
            priorSeat &&
            (priorSeat.programEnrollmentId !== enrollment.id || priorSeat.kind !== command.kind)
          )
            throw rejected('PARTICIPANT_ALREADY_ADMITTED');
          if (
            enrollment.status !== 'ACTIVE' ||
            !enrollment.startsAt ||
            enrollment.startsAt > new Date() ||
            (enrollment.endsAt && enrollment.endsAt <= new Date()) ||
            !(await tx.user.count({ where: { id: member.userId, status: 'ACTIVE' } }))
          )
            throw unavailable();
          if (!priorSeat) {
            const consumed = seats.filter((s) => s.kind === command.kind).length;
            const limit =
              command.kind === 'EXTERNAL'
                ? Math.min(policy.externalParticipantCap, policy.currentWaveCap)
                : policy.internalParticipantCap;
            if (consumed >= limit)
              throw rejected(
                command.kind === 'EXTERNAL' && consumed >= 100
                  ? 'PILOT_CAP_REACHED'
                  : 'WAVE_CAP_REACHED',
              );
            await tx.personalLearningPilotSeat.create({
              data: {
                ...a,
                participantHash: hash,
                programEnrollmentId: enrollment.id,
                kind: command.kind,
                cohort: command.kind === 'INTERNAL' ? 'INTERNAL' : `WAVE_${policy.currentWave}`,
                seatNumber: consumed + 1,
              },
            });
          }
          reason = priorSeat ? 'PARTICIPANT_ALREADY_ADMITTED' : 'PARTICIPANT_ADMITTED';
        }
        nextPolicy = { ...policy, revision: policy.revision + 1 };
      }
      const newSeats = await tx.personalLearningPilotSeat.findMany({ where: a });
      await tx.serviceProgram.update({
        where: { id: a.serviceProgramId },
        data: {
          settings: {
            ...settings,
            personalLearningPilot: {
              ...pilot,
              enabled: false,
              participantControl: nextPolicy as unknown as Prisma.InputJsonValue,
              enrollmentIds: newSeats.filter((s) => !s.revokedAt).map((s) => s.programEnrollmentId),
            },
          },
        },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: a.workspaceId,
          groupId: a.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: a.serviceProgramId,
          action: auditKey,
          performedByUserId: actorUserId,
          afterData: {
            digest,
            reason,
            revision: nextPolicy?.revision ?? 0,
            reviewEvidenceKey: command.reviewEvidenceKey,
            ...(command.action !== 'CONFIGURE'
              ? { programEnrollmentId: command.programEnrollmentId }
              : {}),
            currentWave: nextPolicy?.currentWave ?? 0,
          },
        },
      });
      return { replayed: false, revision: nextPolicy?.revision ?? 0, reason };
    });
  }
}
