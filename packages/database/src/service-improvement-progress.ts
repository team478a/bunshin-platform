import {
  SOCIAL_PROGRESS_OBSERVATION_DEFINITION,
  TRAINING_PROGRESS_OBSERVATION_DEFINITION,
  validateImprovementReadRequest,
  type ImprovementObservationAdapter,
  type ImprovementReadRequest,
} from '@bunshin/application';
import { AI_TRAINING_V1_MODULE_KEY } from '@bunshin/capability-training';
import { sameImprovementScope, type ImprovementScope } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';
import { Prisma, type PrismaClient } from '@prisma/client';

function invalid(): never {
  throw new ApplicationError('VALIDATION_ERROR', 'invalid progress observation source');
}
function snapshot(input: ImprovementReadRequest, configuredScope: ImprovementScope) {
  validateImprovementReadRequest(input);
  const request = {
    ...input,
    scope: { ...input.scope },
    subject: input.subject ? { ...input.subject } : null,
    fromInclusive: new Date(input.fromInclusive),
    toExclusive: new Date(input.toExclusive),
  };
  if (!sameImprovementScope(request.scope, configuredScope))
    throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
  return request;
}
async function authorize(tx: Prisma.TransactionClient, request: ImprovementReadRequest) {
  const manager = await tx.groupMembership.findFirst({
    where: {
      workspaceId: request.scope.workspaceId,
      groupId: request.scope.serviceId,
      userId: request.actorUserId,
      status: 'ACTIVE',
      serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN'] },
      user: { status: 'ACTIVE' },
      group: {
        status: 'ACTIVE',
        workspace: { status: 'ACTIVE' },
        serviceConfiguration: { isNot: null },
      },
    },
    select: { id: true },
  });
  if (!manager) throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
}
const coverage = (truncated: boolean) => ({
  completeness: truncated ? ('PARTIAL' as const) : ('COMPLETE' as const),
  missingCount: truncated ? null : 0,
  truncated,
});
const validDate = (date: Date) => date instanceof Date && Number.isFinite(date.getTime());
function observation(
  request: ImprovementReadRequest,
  row: { id: string; userId: string; bunshinId: string | null; occurredAt: Date; updatedAt: Date },
  metadata: Record<string, boolean>,
  kind: 'DAILY_MISSION' | 'TRAINING_ASSIGNMENT',
) {
  if (!validDate(row.updatedAt)) invalid();
  return {
    scope: { ...request.scope },
    source: { kind, id: row.id, revision: row.updatedAt.toISOString() },
    occurredAt: row.occurredAt,
    feature: 'RECORDED_PROGRESS',
    action: 'OBSERVE',
    eventType: 'COHORT_SNAPSHOT',
    status: 'RECORDED',
    category: 'UNKNOWN' as const,
    purpose: 'PRODUCT_IMPROVEMENT' as const,
    subtype: kind === 'DAILY_MISSION' ? 'RECORDED_MISSION' : 'RECORDED_ASSIGNMENT',
    errorCode: null,
    correlation: { kind: 'EXPLICIT_REFERENCE' as const, key: row.id },
    releaseSha: null,
    userRef: row.userId,
    bunshinRef: row.bunshinId,
    entityRef: row.id,
    metadata,
  };
}

/** Recorded Mission cohort only. No content, rejection prose, URLs, or performance JSON. */
export class PrismaSocialProgressImprovementAdapter implements ImprovementObservationAdapter {
  readonly definition = SOCIAL_PROGRESS_OBSERVATION_DEFINITION;
  private readonly scope: ImprovementScope;
  constructor(
    private readonly client: PrismaClient,
    scope: ImprovementScope,
  ) {
    this.scope = { ...scope };
  }
  async readObservations(input: ImprovementReadRequest) {
    const request = snapshot(input, this.scope);
    if (
      request.scope.packageKey !== this.definition.packageKey ||
      request.scope.adapterKey !== this.definition.key
    )
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    return this.client.$transaction(
      async (tx) => {
        await authorize(tx, request);
        const rows = await tx.dailyMission.findMany({
          where: {
            workspaceId: request.scope.workspaceId,
            createdAt: { gte: request.fromInclusive, lt: request.toExclusive },
            bunshin: {
              workspaceId: request.scope.workspaceId,
              groupId: request.scope.serviceId,
              ...(request.subject
                ? {
                    ownerUserId: request.subject.userRef,
                    ...(request.subject.bunshinRef === null
                      ? {}
                      : { id: request.subject.bunshinRef }),
                  }
                : {}),
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: request.limit + 1,
          select: {
            id: true,
            workspaceId: true,
            bunshinId: true,
            createdAt: true,
            updatedAt: true,
            bunshin: { select: { id: true, workspaceId: true, groupId: true, ownerUserId: true } },
            decision: {
              select: {
                workspaceId: true,
                bunshinId: true,
                dailyMissionId: true,
                decision: true,
                decidedAt: true,
                updatedAt: true,
              },
            },
            postRecord: {
              select: {
                workspaceId: true,
                bunshinId: true,
                dailyMissionId: true,
                actorUserId: true,
                postedAt: true,
                createdAt: true,
              },
            },
          },
        });
        const truncated = rows.length > request.limit;
        const observations = rows.slice(0, request.limit).map((row) => {
          const b = row.bunshin,
            d = row.decision,
            p = row.postRecord;
          if (
            row.workspaceId !== request.scope.workspaceId ||
            b.workspaceId !== row.workspaceId ||
            b.groupId !== request.scope.serviceId ||
            b.id !== row.bunshinId ||
            (request.subject &&
              (b.ownerUserId !== request.subject.userRef ||
                (request.subject.bunshinRef !== null && b.id !== request.subject.bunshinRef))) ||
            (d &&
              (d.workspaceId !== row.workspaceId ||
                d.bunshinId !== row.bunshinId ||
                d.dailyMissionId !== row.id)) ||
            (p &&
              (p.workspaceId !== row.workspaceId ||
                p.bunshinId !== row.bunshinId ||
                p.dailyMissionId !== row.id ||
                p.actorUserId !== b.ownerUserId))
          )
            invalid();
          if (d && !['PENDING', 'ACCEPTED', 'REJECTED'].includes(d.decision)) invalid();
          const decisionKnown =
            !d ||
            (validDate(d.updatedAt) &&
              d.updatedAt < request.toExclusive &&
              (d.decision === 'PENDING'
                ? d.decidedAt === null
                : d.decidedAt !== null &&
                  validDate(d.decidedAt) &&
                  d.decidedAt >= row.createdAt &&
                  d.updatedAt >= d.decidedAt &&
                  d.decidedAt < request.toExclusive));
          const postKnown =
            !p ||
            (validDate(p.postedAt) &&
              validDate(p.createdAt) &&
              p.postedAt >= row.createdAt &&
              p.postedAt <= p.createdAt &&
              p.createdAt >= row.createdAt &&
              p.createdAt < request.toExclusive);
          return observation(
            request,
            {
              id: row.id,
              userId: b.ownerUserId,
              bunshinId: row.bunshinId,
              occurredAt: row.createdAt,
              updatedAt: row.updatedAt,
            },
            {
              accepted: decisionKnown && d?.decision === 'ACCEPTED',
              rejected: decisionKnown && d?.decision === 'REJECTED',
              posted: postKnown && p !== null && p.postedAt < request.toExclusive,
              uncertain: !decisionKnown || !postKnown,
            },
            'DAILY_MISSION',
          );
        });
        return { observations, coverage: coverage(truncated) };
      },
      { isolationLevel: 'RepeatableRead', timeout: 20_000 },
    );
  }
}

interface TrainingProgressRow {
  id: string;
  workspaceId: string;
  groupId: string;
  userId: string;
  presentedAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  submittedAt: Date | null;
  answerUpdatedAt: Date | null;
  evaluationStatus: string | null;
  evaluatedAt: Date | null;
}
/** Same scoped SQL projection discipline as admin evaluation metrics, but no individual results. */
export class PrismaTrainingProgressImprovementAdapter implements ImprovementObservationAdapter {
  readonly definition = TRAINING_PROGRESS_OBSERVATION_DEFINITION;
  private readonly scope: ImprovementScope;
  constructor(
    private readonly client: PrismaClient,
    scope: ImprovementScope,
  ) {
    this.scope = { ...scope };
  }
  async readObservations(input: ImprovementReadRequest) {
    const request = snapshot(input, this.scope);
    if (
      request.scope.packageKey !== this.definition.packageKey ||
      request.scope.adapterKey !== this.definition.key ||
      request.subject?.bunshinRef != null
    )
      throw new ApplicationError('NOT_FOUND', 'improvement scope not found');
    return this.client.$transaction(
      async (tx) => {
        await authorize(tx, request);
        // No Answer/evaluation/metadata/displaySnapshot JSON crosses this boundary.
        const rows = await tx.$queryRaw<TrainingProgressRow[]>(Prisma.sql`
        SELECT a.id, a.workspace_id AS "workspaceId", a.group_id AS "groupId", m.user_id AS "userId",
          a.presented_at AS "presentedAt", a.updated_at AS "updatedAt",
          a.started_at AS "startedAt", a.completed_at AS "completedAt",
          ans.created_at AS "submittedAt", ans.updated_at AS "answerUpdatedAt",
          ans.evaluation_status::text AS "evaluationStatus", ans.evaluated_at AS "evaluatedAt"
        FROM program_mission_assignments a
        JOIN program_enrollments e ON e.id = a.program_enrollment_id
          AND e.workspace_id = a.workspace_id AND e.group_id = a.group_id
        JOIN group_memberships m ON m.id = e.group_membership_id
          AND m.workspace_id = e.workspace_id AND m.group_id = e.group_id
        JOIN users u ON u.id = m.user_id AND u.status = 'ACTIVE'
        JOIN service_programs p ON p.id = e.service_program_id
          AND p.workspace_id = e.workspace_id AND p.group_id = e.group_id
        LEFT JOIN training_mission_answers ans ON ans.mission_assignment_id = a.id
          AND ans.program_enrollment_id = e.id AND ans.workspace_id = a.workspace_id
          AND ans.group_id = a.group_id AND ans.user_id = m.user_id
        WHERE a.workspace_id = ${request.scope.workspaceId}::uuid AND a.group_id = ${request.scope.serviceId}::uuid
          AND a.presented_at >= ${request.fromInclusive} AND a.presented_at < ${request.toExclusive}
          AND p.settings->>'moduleKey' = ${AI_TRAINING_V1_MODULE_KEY}
          AND m.status IN ('ACTIVE', 'SUSPENDED') AND m.service_role = 'PARTICIPANT'
          ${request.subject ? Prisma.sql`AND m.user_id = ${request.subject.userRef}::uuid` : Prisma.empty}
        ORDER BY a.presented_at ASC, a.id ASC LIMIT ${request.limit + 1}
      `);
        const truncated = rows.length > request.limit;
        const observations = rows.slice(0, request.limit).map((row) => {
          if (
            row.workspaceId !== request.scope.workspaceId ||
            row.groupId !== request.scope.serviceId ||
            (request.subject && row.userId !== request.subject.userRef) ||
            (row.evaluationStatus !== null &&
              !['PENDING', 'READY', 'FAILED'].includes(row.evaluationStatus))
          )
            invalid();
          const byCutoff = (date: Date | null) =>
            date !== null &&
            validDate(date) &&
            date >= row.presentedAt &&
            date < request.toExclusive;
          const timestampsValid = [row.startedAt, row.completedAt, row.submittedAt].every(
            (date) => date === null || (validDate(date) && date >= row.presentedAt),
          );
          const submitted = byCutoff(row.submittedAt);
          const evaluationKnown =
            row.submittedAt === null
              ? row.evaluationStatus === null &&
                row.answerUpdatedAt === null &&
                row.evaluatedAt === null
              : submitted &&
                row.answerUpdatedAt !== null &&
                validDate(row.answerUpdatedAt) &&
                row.answerUpdatedAt >= row.submittedAt &&
                row.answerUpdatedAt < request.toExclusive &&
                (row.evaluationStatus === 'PENDING' ||
                  row.evaluationStatus === 'FAILED' ||
                  (row.evaluationStatus === 'READY' &&
                    byCutoff(row.evaluatedAt) &&
                    row.evaluatedAt !== null &&
                    row.evaluatedAt >= row.submittedAt &&
                    row.evaluatedAt <= row.answerUpdatedAt));
          return observation(
            request,
            {
              id: row.id,
              userId: row.userId,
              bunshinId: null,
              occurredAt: row.presentedAt,
              updatedAt: row.updatedAt,
            },
            {
              started: byCutoff(row.startedAt),
              completed: byCutoff(row.completedAt),
              submitted,
              evaluationReady: evaluationKnown && row.evaluationStatus === 'READY',
              evaluationFailed: evaluationKnown && row.evaluationStatus === 'FAILED',
              uncertain: !timestampsValid || !evaluationKnown,
            },
            'TRAINING_ASSIGNMENT',
          );
        });
        return { observations, coverage: coverage(truncated) };
      },
      { isolationLevel: 'RepeatableRead', timeout: 20_000 },
    );
  }
}
