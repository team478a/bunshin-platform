import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApplicationError } from '@bunshin/shared';
import {
  validatePersonalLearningActor,
  validatePersonalLearningWrite,
  definePersonalLearningPlan,
  definePersonalLearningPlanRevision,
  projectProgramMemberGoalReference,
  type PersonalLearningPersistenceRepository,
  type PersonalLearningActor,
  type PersonalLearningWrite,
  type PersonalLearningReceipt,
  type ConfirmedLearningGoalReference,
  type PersonalLearningPlan,
  type LearningPlanStep,
  type LearningDefinitionReference,
} from '@bunshin/application';
import {
  AI_TRAINING_V1_MODULE_KEY,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  AI_TRAINING_CONSULTATION_RULE_VERSION,
  consultAiTrainingLearning,
  projectAiTrainingLearnerProfiles,
} from '@bunshin/capability-training';
import { lockTrainingEnrollmentData } from './training-data-lock';
import { trainingEnrollmentPeriodWhere } from './training-enrollment-period';

type Tx = Prisma.TransactionClient;
type Confirmation = Prisma.PersonalLearningGoalConfirmationGetPayload<{ include: { goal: true } }>;
type Revision = Prisma.PersonalLearningPlanRevisionGetPayload<{
  include: { goalConfirmation: { include: { goal: true } } };
}>;
const hash = (value: unknown) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_key, item: unknown) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(
              Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
            )
          : item,
      ),
    )
    .digest('hex');
function conflict(): never {
  throw new ApplicationError('CONFLICT', 'personal learning operation conflict');
}
function denied(): never {
  throw new ApplicationError('NOT_FOUND', 'personal learning scope not found');
}
const refKey = (ref: LearningDefinitionReference) =>
  `${ref.packageKey}:${ref.definitionKey}:${ref.version}`;
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Explicit client only. No public API, default connection, Provider, or Runtime registration. */
export class PrismaPersonalLearningPersistenceRepository implements PersonalLearningPersistenceRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly now = () => new Date(),
  ) {}
  private async authorized<T>(
    input: PersonalLearningActor,
    write: boolean,
    work: (tx: Tx, now: Date) => Promise<T>,
  ): Promise<T> {
    validatePersonalLearningActor(input);
    const s = input.scope;
    try {
      return await this.client.$transaction(
        async (tx) => {
          await lockTrainingEnrollmentData(tx, { ...s, actorUserId: input.actorUserId });
          const members = await tx.$queryRaw<{ id: string }[]>`
          SELECT m.id FROM group_memberships m JOIN users u ON u.id=m.user_id
          JOIN groups g ON g.id=m.group_id JOIN workspaces w ON w.id=g.workspace_id
          WHERE m.id=${s.groupMembershipId}::uuid AND m.workspace_id=${s.workspaceId}::uuid
            AND m.group_id=${s.groupId}::uuid AND m.user_id=${s.userId}::uuid
            AND g.workspace_id=${s.workspaceId}::uuid
            AND m.status::text='ACTIVE' AND m.service_role::text='PARTICIPANT'
            AND u.status::text='ACTIVE' AND g.status::text='ACTIVE' AND w.status::text='ACTIVE'
          FOR SHARE OF m,u,g,w`;
          if (members.length !== 1) denied();
          const now = this.now();
          const enrollment = await tx.programEnrollment.findFirst({
            where: {
              id: s.programEnrollmentId,
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              groupMembershipId: s.groupMembershipId,
              ...(write ? { status: 'ACTIVE', AND: [trainingEnrollmentPeriodWhere(now)] } : {}),
            },
          });
          if (!enrollment) denied();
          const programs = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM service_programs WHERE id=${enrollment.serviceProgramId}::uuid
            AND workspace_id=${s.workspaceId}::uuid AND group_id=${s.groupId}::uuid
            AND status::text='ACTIVE' AND settings->>'moduleKey'=${AI_TRAINING_V1_MODULE_KEY} FOR SHARE`;
          if (programs.length !== 1) denied();
          const deletion = await tx.programAuditLog.findFirst({
            where: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              resourceType: 'PROGRAM_ENROLLMENT',
              resourceId: s.programEnrollmentId,
              action: 'TRAINING_PERSONAL_DATA_DELETED',
              afterData: { path: ['kind'], equals: 'ALL' },
            },
          });
          if (deletion) denied();
          return work(tx, now);
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
  private async approved(
    tx: Tx,
    input: PersonalLearningActor,
  ): Promise<readonly LearningDefinitionReference[]> {
    const s = input.scope;
    const rows = await tx.$queryRaw<
      { packageKey: string; definitionKey: string; version: string }[]
    >`
      SELECT a.package_key AS "packageKey", a.definition_key AS "definitionKey", a.version
      FROM learning_definition_approvals a JOIN group_memberships m
        ON m.workspace_id=a.workspace_id AND m.group_id=a.group_id AND m.user_id=a.approved_by_user_id
      JOIN users u ON u.id=m.user_id
      WHERE a.workspace_id=${s.workspaceId}::uuid AND a.group_id=${s.groupId}::uuid
        AND a.approval_status='APPROVED' AND a.approved_at IS NOT NULL AND a.approved_at<=${this.now()}
        AND m.status::text='ACTIVE' AND m.service_role::text IN ('SERVICE_OWNER','SERVICE_ADMIN')
        AND u.status::text='ACTIVE' FOR SHARE OF a,m,u`;
    return AI_TRAINING_LEARNING_DEFINITION_FIXTURES.filter((definition) =>
      rows.some((ref) => refKey(ref) === refKey(definition.reference)),
    ).map((definition) => definition.reference);
  }
  private goalReference(row: Confirmation): ConfirmedLearningGoalReference {
    const scope = {
      workspaceId: row.workspaceId,
      groupId: row.groupId,
      programEnrollmentId: row.programEnrollmentId,
      groupMembershipId: row.groupMembershipId,
      userId: row.userId,
    };
    return Object.freeze({
      kind: 'CONFIRMED_GOAL_REFERENCE',
      confirmedByUserId: row.userId,
      semanticRef: Object.freeze({
        packageKey: row.packageKey,
        goalKey: row.goalKey,
        version: row.semanticVersion,
      }),
      reference: projectProgramMemberGoalReference(scope, row.goal),
    });
  }
  private restore(row: Revision): PersonalLearningPlan {
    const goal = this.goalReference(row.goalConfirmation);
    // Immutable confirmation snapshot. Current Goal state is returned separately, never inferred from Plan.
    const snapshot = { ...goal, reference: { ...goal.reference, status: 'ACTIVE' as const } };
    const base = {
      contractVersion: row.contractVersion,
      ruleVersion: row.ruleVersion,
      planId: row.planId,
      revision: row.revision,
      previousRevision:
        row.previousRevision === null
          ? null
          : { planId: row.planId, revision: row.previousRevision },
      revisionReason: row.revisionReason,
      scope: goal.reference.scope,
      goal: snapshot,
      steps: row.steps as unknown as readonly LearningPlanStep[],
      status: row.status,
      confirmation:
        row.confirmedAt === null
          ? null
          : { planId: row.planId, revision: row.revision, confirmedByUserId: row.userId },
    };
    return definePersonalLearningPlan(base as PersonalLearningPlan);
  }
  private async receipt(
    tx: Tx,
    input: PersonalLearningWrite,
    operation: string,
    digest: string,
    work: () => Promise<PersonalLearningReceipt>,
    now: Date,
  ): Promise<PersonalLearningReceipt> {
    validatePersonalLearningWrite(input);
    const s = input.scope;
    const idempotencyKey = `PERSONAL_LEARNING_${input.idempotencyKey}`;
    const prior = await tx.programActionEvent.findUnique({
      where: {
        workspaceId_groupId_idempotencyKey: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          idempotencyKey,
        },
      },
    });
    if (prior) {
      const data = prior.metadata as {
        digest?: string;
        goalId?: string;
        planId?: string | null;
        revision?: number | null;
      };
      if (
        prior.actorUserId !== s.userId ||
        prior.programEnrollmentId !== s.programEnrollmentId ||
        prior.eventType !== operation ||
        data.digest !== digest ||
        !data.goalId
      )
        conflict();
      return { goalId: data.goalId, planId: data.planId ?? null, revision: data.revision ?? null };
    }
    const result = await work();
    await tx.programActionEvent.create({
      data: {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        eventType: operation,
        sourceResourceType: 'PERSONAL_LEARNING',
        sourceResourceId: result.planId ?? result.goalId,
        idempotencyKey,
        metadata: { digest, ...result },
        actorUserId: s.userId,
        occurredAt: now,
      },
    });
    return result;
  }
  async confirmGoal(input: Parameters<PersonalLearningPersistenceRepository['confirmGoal']>[0]) {
    validatePersonalLearningWrite(input);
    return await this.authorized(input, true, async (tx, now) => {
      const s = input.scope;
      const profile = await tx.trainingParticipantProfile.findFirst({ where: { ...s } });
      const goals = await tx.programMemberGoal.findMany({
        where: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          groupMembershipId: s.groupMembershipId,
        },
      });
      const projections = projectAiTrainingLearnerProfiles({ scope: s, profile, goals });
      const result = consultAiTrainingLearning(
        { ...projections, scope: s, approvedDefinitionRefs: await this.approved(tx, input) },
        input.consultation,
      );
      if (result.status !== 'LEARNER_SELECTED_CANDIDATE') conflict();
      return this.receipt(
        tx,
        input,
        'PERSONAL_LEARNING_GOAL_CONFIRMED',
        hash(result.candidate),
        async () => {
          if (goals.some((goal) => goal.status === 'ACTIVE')) conflict();
          const goal = await tx.programMemberGoal.create({
            data: {
              workspaceId: s.workspaceId,
              groupId: s.groupId,
              programEnrollmentId: s.programEnrollmentId,
              groupMembershipId: s.groupMembershipId,
              title: result.candidate.learningObjective,
              metricType: 'ACTION',
              targetValue: 1,
              currentValue: 0,
              unit: '学習目標',
              startsAt: now,
              dueAt: null,
              createdByUserId: s.userId,
              updatedByUserId: s.userId,
            },
          });
          await tx.personalLearningGoalConfirmation.create({
            data: {
              ...s,
              programMemberGoalId: goal.id,
              packageKey: result.candidate.goal.semanticRef.packageKey,
              goalKey: result.candidate.goal.semanticRef.goalKey,
              semanticVersion: result.candidate.goal.semanticRef.version,
              consultationRuleVersion: result.ruleVersion,
              scopeRuleVersion: result.scopeDecision.ruleVersion,
              confirmedAt: now,
            },
          });
          return { goalId: goal.id, planId: null, revision: null };
        },
        now,
      );
    });
  }
  private async goal(tx: Tx, input: PersonalLearningActor, goalId: string) {
    if (!uuid(goalId)) conflict();
    const row = await tx.personalLearningGoalConfirmation.findFirst({
      where: { ...input.scope, programMemberGoalId: goalId },
      include: { goal: true },
    });
    if (!row || row.goal.status !== 'ACTIVE') denied();
    return row;
  }
  private async definitions(tx: Tx, input: PersonalLearningActor, plan: PersonalLearningPlan) {
    if (
      !['PERSONAL_LEARNING_PLAN_V1', AI_TRAINING_CONSULTATION_RULE_VERSION].includes(
        plan.ruleVersion,
      )
    )
      conflict();
    const approved = new Set((await this.approved(tx, input)).map(refKey));
    for (const step of plan.steps) {
      if (
        ![
          'GOAL_ALIGNMENT',
          'PREREQUISITE_REQUIRED',
          'REVIEW_REQUIRED',
          'LEARNER_REQUEST',
          'SKILL_ALREADY_MASTERED',
        ].includes(step.selectionReason)
      )
        conflict();
      const fixture = AI_TRAINING_LEARNING_DEFINITION_FIXTURES.find(
        (definition) => refKey(definition.reference) === refKey(step.definition),
      );
      if (
        !fixture ||
        !approved.has(refKey(step.definition)) ||
        hash(step.prerequisites) !== hash(fixture.prerequisites) ||
        step.prerequisites.some((ref) => !approved.has(refKey(ref)))
      )
        conflict();
    }
  }
  async savePlan(input: Parameters<PersonalLearningPersistenceRepository['savePlan']>[0]) {
    validatePersonalLearningWrite(input);
    const plan = definePersonalLearningPlan(input.plan);
    if (
      plan.status !== 'DRAFT' ||
      !uuid(plan.planId) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      hash(plan.scope) !== hash(input.scope)
    )
      conflict();
    return await this.authorized(input, true, async (tx, now) => {
      const row = await this.goal(tx, input, plan.goal.reference.programMemberGoalId);
      if (hash(this.goalReference(row)) !== hash(plan.goal)) conflict();
      await this.definitions(tx, input, plan);
      return this.receipt(
        tx,
        input,
        plan.revision === 1 ? 'PERSONAL_LEARNING_PLAN_CREATED' : 'PERSONAL_LEARNING_PLAN_REVISED',
        hash({ plan, expectedRevision: input.expectedRevision }),
        async () => {
          const previous = await tx.personalLearningPlanRevision.findFirst({
            where: { ...input.scope, planId: plan.planId },
            orderBy: { revision: 'desc' },
            include: { goalConfirmation: { include: { goal: true } } },
          });
          if (
            (previous?.revision ?? 0) !== input.expectedRevision ||
            plan.revision !== input.expectedRevision + 1
          )
            conflict();
          if (previous) definePersonalLearningPlanRevision(this.restore(previous), plan);
          else if (
            await tx.personalLearningPlanRevision.count({
              where: { ...input.scope, programMemberGoalId: row.programMemberGoalId },
            })
          )
            conflict();
          if (previous?.status === 'CONFIRMED')
            await tx.personalLearningPlanRevision.update({
              where: { planId_revision: { planId: previous.planId, revision: previous.revision } },
              data: { status: 'SUPERSEDED' },
            });
          await tx.personalLearningPlanRevision.create({
            data: {
              ...input.scope,
              planId: plan.planId,
              revision: plan.revision,
              previousRevision: plan.previousRevision?.revision ?? null,
              revisionReason: plan.revisionReason,
              programMemberGoalId: row.programMemberGoalId,
              contractVersion: plan.contractVersion,
              ruleVersion: plan.ruleVersion,
              status: 'DRAFT',
              steps: JSON.parse(JSON.stringify(plan.steps)) as Prisma.InputJsonValue,
              createdAt: now,
            },
          });
          await tx.programMemberGoal.update({
            where: { id: row.programMemberGoalId },
            data: { updatedAt: now },
          });
          return { goalId: row.programMemberGoalId, planId: plan.planId, revision: plan.revision };
        },
        now,
      );
    });
  }
  async confirmPlan(input: Parameters<PersonalLearningPersistenceRepository['confirmPlan']>[0]) {
    validatePersonalLearningWrite(input);
    if (
      !uuid(input.planId) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1
    )
      conflict();
    return await this.authorized(input, true, async (tx, now) => {
      const row = await tx.personalLearningPlanRevision.findFirst({
        where: { ...input.scope, planId: input.planId, revision: input.expectedRevision },
        include: { goalConfirmation: { include: { goal: true } } },
      });
      if (!row || row.revision !== input.expectedRevision) conflict();
      await this.goal(tx, input, row.programMemberGoalId);
      const plan = this.restore(row);
      await this.definitions(tx, input, plan);
      return this.receipt(
        tx,
        input,
        'PERSONAL_LEARNING_PLAN_CONFIRMED',
        hash({ planId: row.planId, revision: row.revision }),
        async () => {
          if (row.status !== 'DRAFT') conflict();
          const latest = await tx.personalLearningPlanRevision.findFirst({
            where: { ...input.scope, planId: row.planId },
            orderBy: { revision: 'desc' },
          });
          if (latest?.revision !== input.expectedRevision) conflict();
          await tx.personalLearningPlanRevision.update({
            where: { planId_revision: { planId: row.planId, revision: row.revision } },
            data: { status: 'CONFIRMED', confirmedAt: now },
          });
          return { goalId: row.programMemberGoalId, planId: row.planId, revision: row.revision };
        },
        now,
      );
    });
  }
  read(input: PersonalLearningActor) {
    return this.authorized(input, false, async (tx) => {
      const goals = await tx.personalLearningGoalConfirmation.findMany({
        where: { ...input.scope },
        include: { goal: true },
      });
      const rows = await tx.personalLearningPlanRevision.findMany({
        where: { ...input.scope },
        orderBy: [{ planId: 'asc' }, { revision: 'asc' }],
        take: 1001,
        include: { goalConfirmation: { include: { goal: true } } },
      });
      if (rows.length > 1000) conflict();
      return {
        goals: goals.map((row) => ({
          reference: this.goalReference(row),
          confirmedAt: row.confirmedAt.toISOString(),
        })),
        plans: rows.map((row) => ({
          plan: this.restore(row),
          goalActive: row.goalConfirmation.goal.status === 'ACTIVE',
          isCurrent: !rows.some(
            (other) => other.planId === row.planId && other.revision > row.revision,
          ),
          createdAt: row.createdAt.toISOString(),
          confirmedAt: row.confirmedAt?.toISOString() ?? null,
        })),
      };
    });
  }
}
