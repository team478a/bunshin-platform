import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Prisma, type PrismaClient, type ServiceProgram } from '@prisma/client';
import {
  parsePilotOperation,
  parsePersonalLearningPreparationAuthority,
  parsePersonalLearningCallAdmissionPolicy,
  programDefinitionJson,
  type PilotOperation,
  type PersonalLearningPreparationAuthority,
  type PersonalLearningCallAdmissionPolicy,
} from '@bunshin/application';
import {
  createAiTrainingV1Definition,
  createPersonalLearningProgramDefinition,
  parsePilotParticipantPolicy,
  personalLearningPilotAllows,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { requirePersonalLearningPreparationAuthority } from './personal-learning-preparation-authority';
import { requirePersonalLearningPilotSeat } from './personal-learning-pilot-seat';

const unavailable = () => new ApplicationError('NOT_FOUND', 'pilot operation unavailable');
const conflict = (reason: string) => new ApplicationError('CONFLICT', reason);
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
};
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const token = (p: ServiceProgram) => digest({ id: p.id, status: p.status, settings: p.settings });
type Guard = (action: PilotOperation['action'] | 'READ') => void;
const absentToken = (a: PersonalLearningPreparationAuthority) => digest({ ...a, state: 'ABSENT' });

/** No env mutation, Provider calls, Definition approval or automatic Seat admission. */
export class PrismaPersonalLearningPilotOperations {
  constructor(
    private readonly client: PrismaClient,
    private readonly authority: PersonalLearningPreparationAuthority,
    private readonly guard: Guard,
    private readonly admission?: PersonalLearningCallAdmissionPolicy,
  ) {}
  private async authorized<T>(
    actorUserId: string,
    action: PilotOperation['action'] | 'READ',
    work: (tx: Prisma.TransactionClient, p: ServiceProgram | null) => Promise<T>,
  ) {
    const a = parsePersonalLearningPreparationAuthority(this.authority);
    if (!a || !/^[a-f0-9-]{36}$/.test(actorUserId)) throw unavailable();
    this.guard(action);
    try {
      return await this.client.$transaction(
        async (tx) => {
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
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM service_programs WHERE id=${a.serviceProgramId}::uuid AND workspace_id=${a.workspaceId}::uuid AND group_id=${a.groupId}::uuid FOR UPDATE`;
          if (rows.length !== 1 && !['READ', 'CREATE_PROGRAM'].includes(action))
            throw unavailable();
          const p = await tx.serviceProgram.findUnique({
            where: { id: a.serviceProgramId },
          });
          if (p && (p.workspaceId !== a.workspaceId || p.groupId !== a.groupId))
            throw unavailable();
          if (!p) {
            this.guard(action);
            return work(tx, null);
          }
          if (!['ACTIVE', 'SUSPENDED'].includes(p.status)) throw unavailable();
          if (!p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings))
            throw unavailable();
          this.guard(action);
          return work(tx, p);
        },
        { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(e.code))
        throw conflict('PILOT_CONCURRENT_OPERATION');
      throw e;
    }
  }
  private async snapshot(tx: Prisma.TransactionClient, p: ServiceProgram) {
    const openCallCount = await tx.personalLearningCallAdmission.count({
      where: { ...this.authority, settledAt: null },
    });
    const s = p.settings as Prisma.JsonObject;
    return {
      exists: true,
      stateToken: token(p),
      status: p.status,
      initialized: Object.hasOwn(s, 'personalLearningPilot'),
      enabled: (s.personalLearningPilot as Prisma.JsonObject | undefined)?.enabled === true,
      openCallCount,
      drainStatus: 'UNKNOWN' as const,
    };
  }
  read(actorUserId: string) {
    return this.authorized(actorUserId, 'READ', async (tx, p) => {
      if (p) return this.snapshot(tx, p);
      return {
        exists: false,
        stateToken: absentToken(this.authority),
        status: 'ABSENT' as const,
        initialized: false,
        enabled: false,
        openCallCount: 0,
        drainStatus: 'UNKNOWN' as const,
      };
    });
  }
  private async createProgram(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    c: PilotOperation,
    p: ServiceProgram | null,
  ) {
    const a = this.authority;
    const auditKey = `PILOT_OPERATION_${c.operationId}`;
    if (p) {
      const prior = await tx.programAuditLog.findFirst({
        where: {
          workspaceId: a.workspaceId,
          groupId: a.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: p.id,
          action: auditKey,
        },
      });
      const receipt = prior?.afterData as
        { digest?: string; programOfferingId?: string } | undefined;
      if (!prior || prior.performedByUserId !== actorUserId || receipt?.digest !== digest(c))
        throw conflict('PILOT_PROGRAM_ALREADY_EXISTS');
      return {
        replayed: true,
        programEnrollmentId: undefined,
        programOfferingId: receipt.programOfferingId,
        ...(await this.snapshot(tx, p)),
      };
    }
    if (c.expectedStateToken !== absentToken(a)) throw conflict('PILOT_STATE_CHANGED');
    if (
      await tx.serviceProgram.count({
        where: {
          workspaceId: a.workspaceId,
          groupId: a.groupId,
          settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
        },
      })
    )
      throw conflict('PILOT_EMPTY_DEDICATED_PROGRAM_REQUIRED');
    const definition = programDefinitionJson(createPersonalLearningProgramDefinition());
    const template = await tx.programTemplate.create({
      data: {
        workspaceId: a.workspaceId,
        ownerGroupId: a.groupId,
        name: 'マナベルスタイル Personal Learning',
        description: '本人がAIを使えるようになるための期限なし個別学習。',
        category: 'AI_TRAINING',
        targetAudience: '限定Pilot参加者',
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        createdByUserId: actorUserId,
      },
    });
    const version = await tx.programTemplateVersion.create({
      data: {
        workspaceId: a.workspaceId,
        programTemplateId: template.id,
        version: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        definition,
        createdByUserId: actorUserId,
      },
    });
    const program = await tx.serviceProgram.create({
      data: {
        workspaceId: a.workspaceId,
        groupId: a.groupId,
        id: a.serviceProgramId,
        programTemplateVersionId: version.id,
        displayName: template.name,
        description: template.description,
        status: 'SUSPENDED',
        createdByUserId: actorUserId,
        settings: {
          moduleKey: 'AI_TRAINING_V1',
          supportModes: ['GUIDED'],
          participation: 'INVITATION_ONLY',
          personalLearningProgramVersion: 'PERSONAL_LEARNING_OPEN_ENDED_V1',
          personalLearningPilot: { enabled: false, enrollmentIds: [] },
          trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
          personalLearningPilotOperations: { version: 'PILOT_OPERATIONS_V1', revision: 1 },
        },
      },
    });
    const offering = await tx.programOffering.create({
      data: {
        workspaceId: a.workspaceId,
        groupId: a.groupId,
        serviceProgramId: program.id,
        version: 1,
        status: 'ACTIVE',
        isFree: true,
        startsAt: null,
        endsAt: null,
        seller: 'SERVICE',
        priceOwner: 'SERVICE',
        paymentOwner: 'SERVICE',
        apiCostOwner: 'SERVICE',
        supportOwner: 'SERVICE',
        contentOwner: 'SERVICE',
        characterOwner: 'SERVICE',
        termsSnapshot: {
          supportModes: ['GUIDED'],
          participation: 'INVITATION_ONLY',
          manualEnrollment: true,
        },
        createdByUserId: actorUserId,
      },
    });
    this.guard(c.action);
    await tx.programAuditLog.create({
      data: {
        workspaceId: a.workspaceId,
        groupId: a.groupId,
        resourceType: 'SERVICE_PROGRAM',
        resourceId: program.id,
        action: auditKey,
        performedByUserId: actorUserId,
        beforeData: { stateToken: absentToken(a), status: 'ABSENT' },
        afterData: {
          digest: digest(c),
          operation: c.action,
          reviewEvidenceKey: c.reviewEvidenceKey,
          programTemplateVersionId: version.id,
          programOfferingId: offering.id,
          stateToken: token(program),
          status: program.status,
          revision: 1,
        },
      },
    });
    return {
      replayed: false,
      programEnrollmentId: undefined,
      programOfferingId: offering.id,
      ...(await this.snapshot(tx, program)),
    };
  }
  change(actorUserId: string, raw: PilotOperation) {
    const c = parsePilotOperation(raw);
    if (!c) throw new ApplicationError('VALIDATION_ERROR', 'valid reviewed operation required');
    return this.authorized(actorUserId, c.action, async (tx, p) => {
      if (c.action === 'CREATE_PROGRAM') return this.createProgram(tx, actorUserId, c, p);
      if (!p) throw unavailable();
      const a = this.authority;
      const settings = p.settings as Prisma.JsonObject;
      const operations = settings.trainingOperations;
      const operationsSettings =
        operations && typeof operations === 'object' && !Array.isArray(operations)
          ? operations
          : {};
      const pilot = settings.personalLearningPilot as Prisma.JsonObject | undefined;
      // STOP must preserve the reserved identity, even if other Pilot settings are malformed.
      if (c.action !== 'INITIALIZE' && (!pilot || settings.moduleKey !== 'AI_TRAINING_V1'))
        throw unavailable();
      const auditKey = `PILOT_OPERATION_${c.operationId}`;
      const hash = digest(c);
      const prior = await tx.programAuditLog.findFirst({
        where: {
          workspaceId: a.workspaceId,
          groupId: a.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: p.id,
          action: auditKey,
        },
      });
      if (prior) {
        const receipt = prior.afterData as { digest?: string; programEnrollmentId?: string };
        if (prior.performedByUserId !== actorUserId || receipt.digest !== hash)
          throw conflict('PILOT_OPERATION_CONFLICT');
        if (c.action === 'START' && (p.status !== 'ACTIVE' || pilot?.enabled !== true))
          throw conflict('PILOT_OPERATION_SUPERSEDED');
        if (
          c.action === 'PREPARE_ENROLLMENT' &&
          (!receipt.programEnrollmentId ||
            !(await tx.programEnrollment.count({
              where: {
                ...a,
                id: receipt.programEnrollmentId,
                groupMembershipId: c.groupMembershipId,
              },
            })))
        )
          throw conflict('PILOT_OPERATION_SUPERSEDED');
        return {
          replayed: true,
          programEnrollmentId: receipt.programEnrollmentId,
          programOfferingId: undefined,
          ...(await this.snapshot(tx, p)),
        };
      }
      if (c.action !== 'STOP' && token(p) !== c.expectedStateToken)
        throw conflict('PILOT_STATE_CHANGED');
      let next: Prisma.JsonObject = { ...settings };
      let status = p.status;
      let programEnrollmentId: string | undefined;
      if (c.action === 'INITIALIZE') {
        const version = await tx.programTemplateVersion.findUnique({
          where: { id: p.programTemplateVersionId },
        });
        if (
          pilot ||
          settings.moduleKey !== 'AI_TRAINING_V1' ||
          version?.status !== 'PUBLISHED' ||
          version.workspaceId !== a.workspaceId ||
          !isDeepStrictEqual(version.definition, createAiTrainingV1Definition()) ||
          (await tx.programEnrollment.count({ where: a })) ||
          (await tx.serviceProgram.count({
            where: {
              workspaceId: a.workspaceId,
              groupId: a.groupId,
              id: { not: p.id },
              settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
            },
          }))
        )
          throw conflict('PILOT_EMPTY_DEDICATED_PROGRAM_REQUIRED');
        next = {
          ...settings,
          personalLearningPilot: { enabled: false, enrollmentIds: [] },
          trainingOperations: {
            ...operationsSettings,
            notificationsEnabled: false,
            postponedReminderEnabled: false,
          },
        };
        status = 'SUSPENDED';
      } else if (c.action === 'STOP') {
        next.personalLearningPilot = { ...pilot, enabled: false };
        next.trainingOperations = {
          ...operationsSettings,
          notificationsEnabled: false,
          postponedReminderEnabled: false,
        };
        status = 'SUSPENDED';
      } else {
        await requirePersonalLearningPreparationAuthority(tx, a, a, p.id, true);
        if (c.action === 'PREPARE_ENROLLMENT') {
          const policy = parsePilotParticipantPolicy(pilot?.participantControl);
          if (
            !policy ||
            policy.currentWave !== 0 ||
            policy.internalParticipantCap < 1 ||
            policy.internalParticipantCap > 2
          )
            throw conflict('PILOT_WAVE0_CONFIGURATION_REQUIRED');
          if ((await tx.programEnrollment.count({ where: a })) >= policy.internalParticipantCap)
            throw conflict('PILOT_INTERNAL_PREPARATION_CAP_REACHED');
          const members = await tx.$queryRaw<
            { id: string }[]
          >`SELECT m.id FROM group_memberships m JOIN users u ON u.id=m.user_id
            WHERE m.id=${c.groupMembershipId}::uuid AND m.workspace_id=${a.workspaceId}::uuid AND m.group_id=${a.groupId}::uuid
            AND m.status::text='ACTIVE' AND m.service_role::text IN ('PARTICIPANT','SERVICE_OWNER') AND u.status::text='ACTIVE' FOR SHARE OF m,u`;
          const offerings = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM program_offerings WHERE id=${c.programOfferingId}::uuid AND workspace_id=${a.workspaceId}::uuid AND group_id=${a.groupId}::uuid AND service_program_id=${p.id}::uuid FOR SHARE`;
          if (members.length !== 1 || offerings.length !== 1) throw unavailable();
          const o = await tx.programOffering.findUniqueOrThrow({
            where: { id: c.programOfferingId },
          });
          if (
            !o.termsSnapshot ||
            typeof o.termsSnapshot !== 'object' ||
            Array.isArray(o.termsSnapshot)
          )
            throw unavailable();
          const terms = o.termsSnapshot as { participation?: string; supportModes?: string[] };
          const now = new Date();
          if (
            o.status !== 'ACTIVE' ||
            !o.isFree ||
            o.priceReference !== null ||
            terms.participation !== 'INVITATION_ONLY' ||
            !Array.isArray(terms.supportModes) ||
            !terms.supportModes.includes('GUIDED') ||
            (o.startsAt && o.startsAt > now) ||
            (o.endsAt && o.endsAt <= now)
          )
            throw unavailable();
          if (
            await tx.programEnrollment.count({
              where: { ...a, groupMembershipId: c.groupMembershipId },
            })
          )
            throw conflict('PILOT_ENROLLMENT_ALREADY_EXISTS');
          const e = await tx.programEnrollment.create({
            data: {
              ...a,
              groupMembershipId: c.groupMembershipId,
              programOfferingId: o.id,
              status: 'ACTIVE',
              supportMode: 'GUIDED',
              goalSnapshot: { goal: '' },
              offeringSnapshot: {
                version: o.version,
                isFree: true,
                seller: o.seller,
                apiCostOwner: o.apiCostOwner,
                supportOwner: o.supportOwner,
                contentOwner: o.contentOwner,
                characterOwner: o.characterOwner,
                terms: o.termsSnapshot,
              },
              invitedByUserId: actorUserId,
              startsAt: now,
            },
          });
          programEnrollmentId = e.id;
        } else {
          const policy = parsePilotParticipantPolicy(pilot?.participantControl);
          const admission = parsePersonalLearningCallAdmissionPolicy(this.admission);
          if (
            !policy ||
            policy.currentWave !== 0 ||
            policy.currentWaveCap !== 0 ||
            policy.internalParticipantCap < 1 ||
            policy.internalParticipantCap > 2 ||
            !admission ||
            ['workspaceId', 'groupId', 'serviceProgramId'].some(
              (k) =>
                admission[k as keyof PersonalLearningPreparationAuthority] !==
                a[k as keyof PersonalLearningPreparationAuthority],
            )
          )
            throw conflict('PILOT_WAVE0_CONFIGURATION_REQUIRED');
          const seats = await tx.personalLearningPilotSeat.findMany({ where: a });
          const active = seats.filter((s) => !s.revokedAt);
          if (
            !active.length ||
            active.length > 2 ||
            seats.some((s) => s.kind !== 'INTERNAL') ||
            (await tx.personalLearningCallAdmission.count({ where: { ...a, settledAt: null } }))
          )
            throw conflict('PILOT_START_NOT_READY');
          const projected = { ...settings, personalLearningPilot: { ...pilot, enabled: true } };
          for (const seat of active) {
            if (
              !seat.programEnrollmentId ||
              !personalLearningPilotAllows(projected, seat.programEnrollmentId)
            )
              throw conflict('PILOT_START_NOT_READY');
            const e = await tx.programEnrollment.findFirst({
              where: {
                ...a,
                id: seat.programEnrollmentId,
                status: 'ACTIVE',
                startsAt: { lte: new Date() },
                OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              },
            });
            if (!e) throw conflict('PILOT_START_NOT_READY');
            const m = await tx.groupMembership.findFirst({
              where: { workspaceId: a.workspaceId, groupId: a.groupId, id: e.groupMembershipId },
            });
            if (!m || !(await tx.user.count({ where: { id: m.userId, status: 'ACTIVE' } })))
              throw conflict('PILOT_START_NOT_READY');
            await requirePersonalLearningPilotSeat(
              tx,
              { ...a, programEnrollmentId: e.id, userId: m.userId },
              true,
            );
            if (
              !(await tx.trainingParticipantProfile.count({
                where: {
                  workspaceId: a.workspaceId,
                  groupId: a.groupId,
                  programEnrollmentId: e.id,
                  groupMembershipId: m.id,
                  userId: m.userId,
                  updatedByUserId: m.userId,
                },
              })) ||
              !(await tx.programActionEvent.count({
                where: {
                  workspaceId: a.workspaceId,
                  groupId: a.groupId,
                  programEnrollmentId: e.id,
                  actorUserId: m.userId,
                  eventType: 'PERSONAL_LEARNING_PILOT_PROFILE_INITIALIZED',
                },
              }))
            )
              throw conflict('PILOT_PROFILE_REQUIRED');
          }
          for (const d of AI_TRAINING_LEARNING_DEFINITION_FIXTURES) {
            const approval = await tx.learningDefinitionApproval.findFirst({
              where: {
                workspaceId: a.workspaceId,
                groupId: a.groupId,
                ...d.reference,
                approvalStatus: 'APPROVED',
                approvedAt: { lte: new Date() },
              },
            });
            if (
              !approval?.approvedByUserId ||
              !(await tx.user.count({
                where: { id: approval.approvedByUserId, status: 'ACTIVE' },
              })) ||
              !(await tx.groupMembership.count({
                where: {
                  workspaceId: a.workspaceId,
                  groupId: a.groupId,
                  userId: approval.approvedByUserId,
                  status: 'ACTIVE',
                  serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
                },
              }))
            )
              throw conflict('PILOT_DEFINITION_APPROVAL_REQUIRED');
          }
          next.personalLearningPilot = { ...pilot, enabled: true };
          status = 'ACTIVE';
        }
      }
      const oldControl = settings.personalLearningPilotOperations as Prisma.JsonObject | undefined;
      let revision = oldControl?.revision ?? 0;
      if (
        typeof revision !== 'number' ||
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        revision >= Number.MAX_SAFE_INTEGER
      ) {
        if (c.action !== 'STOP') throw conflict('PILOT_OPERATION_REVISION_INVALID');
        // Corrupt operation metadata must not prevent a fail-closed emergency stop.
        revision = 0;
      }
      next.personalLearningPilotOperations = {
        version: 'PILOT_OPERATIONS_V1',
        revision: revision + 1,
      };
      this.guard(c.action);
      const updated = await tx.serviceProgram.update({
        where: { id: p.id },
        data: { settings: next, status },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: a.workspaceId,
          groupId: a.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: p.id,
          action: auditKey,
          performedByUserId: actorUserId,
          beforeData: { status: p.status, stateToken: token(p) },
          afterData: {
            digest: hash,
            operation: c.action,
            reviewEvidenceKey: c.reviewEvidenceKey,
            stateToken: token(updated),
            status,
            revision: revision + 1,
            ...(programEnrollmentId ? { programEnrollmentId } : {}),
          },
        },
      });
      return {
        replayed: false,
        programEnrollmentId,
        programOfferingId: undefined,
        ...(await this.snapshot(tx, updated)),
      };
    });
  }
}
