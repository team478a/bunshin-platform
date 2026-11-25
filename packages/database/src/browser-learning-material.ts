import {
  BROWSER_FIXTURE_JOB_TYPE,
  CompleteJob,
  type PersonalLearningActor,
  type UserJob,
} from '@bunshin/application';
import {
  browserLearningTarget,
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
  personalLearningOfferPolicy,
} from '@bunshin/capability-training';
import {
  browserObservedFixtureVersion,
  trainingCatalogueDiscoveryPrefix,
} from '@bunshin/capability-browser';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaJobRepository } from './automation-jobs';
import { PrismaPersonalLearningPersistenceRepository } from './personal-learning-persistence';

const environment = 'DEVELOPMENT';
const jobType = BROWSER_FIXTURE_JOB_TYPE;
const reviewInterval = 7 * 24 * 60 * 60 * 1000;
const reportCooldown = 60 * 60 * 1000;
const prefix = 'training-material';
const identity = (id: string) => `${prefix}:${id}`;
const catalogueIdentity = (recipeId: string) => `training-catalogue-material:${recipeId}`;
const catalogueDiscoveryIdentity = (requestId: string) =>
  `${trainingCatalogueDiscoveryPrefix}:${requestId}`;
const jobPattern =
  /^(training-material|training-catalogue-discovery):([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?::([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))?$/i;
const denied = () => new ApplicationError('NOT_FOUND', 'training browser material unavailable');

function discoveryConfigured(workspaceId: string) {
  return (
    process.env['BROWSER_FIXTURE_MODEL_WORKSPACE_ID'] === workspaceId &&
    !!process.env['BROWSER_FIXTURE_MODEL_SECRET']
  );
}

export async function enqueueCatalogueMaterial(
  tx: Prisma.TransactionClient,
  job: Pick<UserJob, 'workspaceId' | 'requestedBy' | 'correlationId'>,
  recipeId: string,
) {
  const reference = catalogueIdentity(recipeId);
  await tx.job.upsert({
    where: { environment_idempotencyKey: { environment, idempotencyKey: reference } },
    create: {
      workspaceId: job.workspaceId,
      requestedBy: job.requestedBy,
      correlationId: job.correlationId,
      environment,
      jobType,
      idempotencyKey: reference,
      payloadReference: `material:${recipeId}`,
      maxAttempts: 3,
    },
    update: {},
  });
}
type MaterialKey = {
  workspaceId: string;
  groupId: string;
  programId: string;
  fixtureDevice: 'desktop' | 'mobile';
};
type MaterialTarget = { kind: 'practice-note' } | { kind: 'catalogue'; recipeId: string | null };
type MaterialWork<T> = (
  tx: Prisma.TransactionClient,
  key: MaterialKey,
  requestId: string,
  target: MaterialTarget,
) => Promise<T>;
const selection = {
  id: true,
  title: true,
  goal: true,
  preparation: true,
  practice: true,
  checkpoint: true,
  verifiedAt: true,
  reviewedAt: true,
  reviewRequestedAt: true,
  revision: true,
  steps: {
    orderBy: { ordinal: 'asc' },
    select: { ordinal: true, stepId: true, instruction: true },
  },
} as const satisfies Prisma.BrowserFixtureMaterialSelect;

export class PrismaBrowserLearningMaterials extends PrismaPersonalLearningPersistenceRepository {
  constructor(private readonly database: PrismaClient) {
    super(database);
  }

  private async authorizedMaterial<T>(
    actor: PersonalLearningActor,
    work: MaterialWork<T>,
    lockEnrollment = true,
  ) {
    if (process.env['APP_ENV'] !== 'development') return null;
    return this.authorized(
      actor,
      true,
      async (tx) => {
        const scope = actor.scope;
        const enrollment = await tx.programEnrollment.findUniqueOrThrow({
          where: { id: scope.programEnrollmentId },
          select: { serviceProgramId: true },
        });
        const program = await tx.serviceProgram.findUniqueOrThrow({
          where: { id: enrollment.serviceProgramId },
          select: { id: true, settings: true },
        });
        if (
          !personalLearningDynamicProgramAllows(program.settings, scope.programEnrollmentId) ||
          !personalLearningFeatureEnabled(program.settings, 'browserMaterials') ||
          personalLearningOfferPolicy(program.settings) !== 'AI_SKILL_V1'
        )
          return null;
        const request = await tx.personalLearningRequest.findFirst({
          where: { ...scope, topicId: actor.topicId ?? null },
          orderBy: { revision: 'desc' },
          select: { id: true, originalText: true, deviceType: true },
        });
        const target = request && browserLearningTarget(request);
        if (!request || !target) return null;
        const key = {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          programId: program.id,
          fixtureDevice: target.device,
        };
        if (target.kind === 'practice-note') return work(tx, key, request.id, target);
        const recipeQuery = {
          where: {
            workspaceId: scope.workspaceId,
            actorId: actor.actorUserId,
            device: target.device,
            fixtureVersion: browserObservedFixtureVersion,
            membership: {
              status: 'ACTIVE',
              workspace: { status: 'ACTIVE' },
              user: { status: 'ACTIVE' },
            },
          },
          orderBy: [{ verifiedAt: 'desc' }, { id: 'asc' }],
          select: { id: true },
        } as const satisfies Prisma.BrowserFixtureRecipeFindFirstArgs;
        const recipe =
          (await tx.browserFixtureRecipe.findFirst({
            ...recipeQuery,
            where: { ...recipeQuery.where, materials: { some: { verifiedAt: { not: null } } } },
          })) ?? (await tx.browserFixtureRecipe.findFirst(recipeQuery));
        return work(tx, key, request.id, { kind: 'catalogue', recipeId: recipe?.id ?? null });
      },
      false,
      lockEnrollment,
    );
  }

  protected async use<T>(
    actor: PersonalLearningActor,
    work: MaterialWork<T>,
    lockEnrollment = true,
  ) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.authorizedMaterial(actor, work, lockEnrollment);
      } catch (error) {
        if (attempt === 3 || !(error instanceof ApplicationError) || error.code !== 'CONFLICT')
          throw error;
      }
    }
  }

  protected materialWhere(key: MaterialKey, target: MaterialTarget) {
    if (target.kind === 'practice-note') return key;
    return target.recipeId ? { recipeId: target.recipeId, verifiedAt: { not: null } } : null;
  }

  readMaterial(actor: PersonalLearningActor) {
    return this.use(
      actor,
      async (tx, key, requestId, target) => {
        const where = this.materialWhere(key, target);
        const material = where
          ? await tx.browserFixtureMaterial.findFirst({
              where,
              orderBy: { revision: 'desc' },
              select: selection,
            })
          : null;
        const reference =
          target.kind === 'practice-note'
            ? identity(requestId)
            : target.recipeId
              ? catalogueIdentity(target.recipeId)
              : catalogueDiscoveryIdentity(requestId);
        const job = material
          ? null
          : await tx.job.findFirst({
              where: {
                environment,
                jobType,
                workspaceId: key.workspaceId,
                requestedBy: actor.actorUserId,
                idempotencyKey: reference,
              },
              select: { status: true },
            });
        const review =
          target.kind === 'practice-note' && material?.reviewRequestedAt
            ? await tx.job.findFirst({
                where: {
                  environment,
                  jobType,
                  workspaceId: key.workspaceId,
                  correlationId: material.id,
                },
                orderBy: { createdAt: 'desc' },
                select: { status: true },
              })
            : null;
        return {
          device: key.fixtureDevice,
          canGenerate: !!where || discoveryConfigured(key.workspaceId),
          canReview: target.kind === 'practice-note',
          material,
          status: job?.status ?? null,
          reviewStatus: review?.status ?? null,
        };
      },
      false,
    );
  }

  enqueue(actor: PersonalLearningActor) {
    return this.use(actor, async (tx, key, requestId, target) => {
      const where = this.materialWhere(key, target);
      if (where && (await tx.browserFixtureMaterial.findFirst({ where, select: { id: true } })))
        return;
      const recipeId = target.kind === 'catalogue' ? target.recipeId : null;
      if (recipeId) {
        await enqueueCatalogueMaterial(
          tx,
          {
            workspaceId: key.workspaceId,
            requestedBy: actor.actorUserId,
            correlationId: requestId,
          },
          recipeId,
        );
        return true;
      }
      const discovery = target.kind === 'catalogue';
      if (discovery && !discoveryConfigured(key.workspaceId)) return;
      const reference = discovery ? catalogueDiscoveryIdentity(requestId) : identity(requestId);
      await tx.job.upsert({
        where: { environment_idempotencyKey: { environment, idempotencyKey: reference } },
        create: {
          environment,
          jobType,
          workspaceId: key.workspaceId,
          requestedBy: actor.actorUserId,
          idempotencyKey: reference,
          payloadReference: reference,
          correlationId: requestId,
          maxAttempts: discovery ? 1 : 3,
        },
        update: {},
      });
      return true;
    });
  }

  readImage(
    actor: PersonalLearningActor,
    materialId: string,
    ordinal: number,
    variant: 'before' | 'after' | 'detail',
  ) {
    const column = ({ before: 'beforeImage', after: 'afterImage', detail: 'detailImage' } as const)[
      variant
    ];
    return this.use(
      actor,
      async (tx, key, _requestId, target) => {
        const where = this.materialWhere(key, target);
        if (!where) return null;
        const step = await tx.browserFixtureMaterialStep.findFirst({
          where: { materialId, ordinal, material: where },
          select: { [column]: true },
        });
        return step?.[column] ?? null;
      },
      false,
    );
  }

  enqueueReview(actor: PersonalLearningActor, materialId: string, periodic = false) {
    return this.use(actor, async (tx, key, requestId, target) => {
      if (target.kind !== 'practice-note') return false;
      const material = await tx.browserFixtureMaterial.findFirst({
        where: key,
        orderBy: { revision: 'desc' },
        select: { id: true, verifiedAt: true, reviewedAt: true },
      });
      if (!material || material.id !== materialId) return false;
      const now = new Date();
      const cutoff = new Date(now.getTime() - (periodic ? reviewInterval : reportCooldown));
      if (
        !material.verifiedAt ||
        (periodic && (material.reviewedAt ?? material.verifiedAt) >= cutoff)
      )
        return false;
      const inProgress = await tx.job.findFirst({
        where: {
          environment,
          jobType,
          workspaceId: key.workspaceId,
          correlationId: material.id,
          status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] },
        },
        select: { id: true },
      });
      if (inProgress) return false;
      const reserved = await tx.browserFixtureMaterial.updateMany({
        where: {
          id: material.id,
          OR: [{ reviewRequestedAt: null }, { reviewRequestedAt: { lt: cutoff } }],
        },
        data: { reviewRequestedAt: now },
      });
      if (!reserved.count) return false;
      await tx.job.create({
        data: {
          environment,
          jobType,
          workspaceId: key.workspaceId,
          requestedBy: actor.actorUserId,
          idempotencyKey: `training-material-review:${material.id}:${now.toISOString()}`,
          payloadReference: `${identity(requestId)}:${material.id}`,
          correlationId: material.id,
          maxAttempts: 3,
        },
      });
      return true;
    });
  }

  async scheduleReviews() {
    if (process.env['APP_ENV'] !== 'development') return 0;
    const cutoff = new Date(Date.now() - reviewInterval);
    let cursor = '00000000-0000-0000-0000-000000000000';
    let queued = 0;
    for (;;) {
      const rows = await this.database.$queryRaw<{ id: string; sourceJobId: string }[]>`
        SELECT m.id, m.source_job_id AS "sourceJobId"
        FROM browser_fixture_materials m
        WHERE m.program_id IS NOT NULL AND m.id > ${cursor}::uuid
          AND COALESCE(m.reviewed_at, m.verified_at) < ${cutoff}
          AND (m.review_requested_at IS NULL OR m.review_requested_at < ${cutoff})
          AND NOT EXISTS (
            SELECT 1 FROM browser_fixture_materials newer
            WHERE (newer.workspace_id, newer.group_id, newer.program_id, newer.fixture_device)
                = (m.workspace_id, m.group_id, m.program_id, m.fixture_device)
              AND newer.revision > m.revision
          )
        ORDER BY m.id LIMIT 20`;
      if (!rows.length) return queued;
      for (const row of rows) {
        cursor = row.id;
        const source = await this.database.job.findFirst({
          where: { id: row.sourceJobId, environment, jobType, status: 'SUCCEEDED' },
        });
        if (!source?.requestedBy) continue;
        try {
          const { actor } = await this.jobActor({ ...source, requestedBy: source.requestedBy });
          if (await this.enqueueReview(actor, row.id, true)) queued += 1;
        } catch (error) {
          if (!(error instanceof ApplicationError) || error.code !== 'NOT_FOUND') throw error;
        }
      }
    }
  }

  async rollback(input: {
    workspaceId: string;
    actorId: string;
    materialId: string;
    expectedCurrentId: string;
  }) {
    if (process.env['APP_ENV'] !== 'development') throw denied();
    return this.database.$transaction(async (tx) => {
      const old = await tx.browserFixtureMaterial.findFirst({
        where: { id: input.materialId, workspaceId: input.workspaceId },
        select: {
          id: true,
          workspaceId: true,
          groupId: true,
          programId: true,
          fixtureDevice: true,
        },
      });
      if (!old?.workspaceId || !old.groupId || !old.programId || !old.fixtureDevice) throw denied();
      const program = await tx.$queryRaw<{ id: string; settings: unknown }[]>`
        SELECT id, settings FROM service_programs
        WHERE id = ${old.programId}::uuid AND workspace_id = ${old.workspaceId}::uuid
          AND group_id = ${old.groupId}::uuid AND status::text = 'ACTIVE'
        FOR UPDATE`;
      if (!program[0] || !personalLearningFeatureEnabled(program[0].settings, 'browserMaterials'))
        throw denied();
      const owner = await tx.groupMembership.findFirst({
        where: {
          workspaceId: old.workspaceId,
          groupId: old.groupId,
          userId: input.actorId,
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          user: { status: 'ACTIVE' },
          group: { status: 'ACTIVE' },
          workspace: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
      if (!owner) throw denied();
      const key = {
        workspaceId: old.workspaceId,
        groupId: old.groupId,
        programId: old.programId,
        fixtureDevice: old.fixtureDevice,
      };
      const current = await tx.browserFixtureMaterial.findFirst({
        where: key,
        orderBy: { revision: 'desc' },
        select: { id: true, revision: true },
      });
      if (!current || current.id !== input.expectedCurrentId || current.id === old.id)
        throw new ApplicationError('CONFLICT', 'browser material version changed');
      const source = await tx.browserFixtureMaterial.findUniqueOrThrow({
        where: { id: old.id },
        include: { steps: true },
      });
      const {
        title,
        goal,
        preparation,
        practice,
        checkpoint,
        verifiedAt,
        reviewedAt,
        semanticDigest,
        sourceJobId,
        sourceAttempt,
      } = source;
      const restored = await tx.browserFixtureMaterial.create({
        data: {
          ...key,
          title,
          goal,
          preparation,
          practice,
          checkpoint,
          verifiedAt,
          reviewedAt,
          semanticDigest,
          sourceJobId,
          sourceAttempt,
          revision: current.revision + 1,
          reviewRequestedAt: new Date(),
          steps: {
            create: source.steps.map(
              ({ ordinal, stepId, instruction, beforeImage, afterImage, detailImage }) => ({
                ordinal,
                stepId,
                instruction,
                beforeImage,
                afterImage,
                detailImage,
              }),
            ),
          },
        },
        select: { id: true, revision: true },
      });
      await tx.programAuditLog.create({
        data: {
          workspaceId: key.workspaceId,
          groupId: key.groupId,
          resourceType: 'SERVICE_PROGRAM',
          resourceId: key.programId,
          action: 'BROWSER_MATERIAL_ROLLED_BACK',
          beforeData: { materialId: current.id, revision: current.revision },
          afterData: { ...restored, restoredFrom: source.id },
          performedByUserId: input.actorId,
        },
      });
      return restored;
    });
  }

  protected async jobActor(
    job: Pick<
      UserJob,
      | 'requestedBy'
      | 'workspaceId'
      | 'environment'
      | 'jobType'
      | 'bunshinId'
      | 'capabilityType'
      | 'payloadReference'
    >,
  ) {
    const [, kind, id, reviewId] = jobPattern.exec(job.payloadReference) ?? [];
    if (
      process.env['APP_ENV'] !== 'development' ||
      !id ||
      (kind === 'training-catalogue-discovery' && !!reviewId) ||
      job.environment !== environment ||
      job.jobType !== jobType ||
      job.bunshinId ||
      job.capabilityType
    )
      throw denied();
    const request = await this.database.personalLearningRequest.findFirst({
      where: { id, workspaceId: job.workspaceId, userId: job.requestedBy },
      select: {
        workspaceId: true,
        groupId: true,
        programEnrollmentId: true,
        groupMembershipId: true,
        userId: true,
        topicId: true,
      },
    });
    if (!request) throw denied();
    const { topicId, ...scope } = request;
    return {
      id,
      kind,
      reviewId,
      actor: { actorUserId: job.requestedBy, scope, ...(topicId ? { topicId } : {}) },
    };
  }

  async catalogueDiscovery(job: Parameters<PrismaBrowserLearningMaterials['jobActor']>[0]) {
    const { id, kind, actor } = await this.jobActor(job);
    if (kind !== 'training-catalogue-discovery') throw denied();
    const device = await this.use(
      actor,
      (_tx, key, currentId, target) => {
        if (target.kind !== 'catalogue' || currentId !== id) throw denied();
        return Promise.resolve(key.fixtureDevice);
      },
      false,
    );
    if (!device) throw denied();
    return device;
  }

  async jobMaterial(job: UserJob) {
    const { id, actor, reviewId } = await this.jobActor(job);
    const target = await this.use(actor, async (tx, key, currentId, target) => {
      if (target.kind !== 'practice-note') throw denied();
      if (!reviewId && id !== currentId) throw denied();
      const existing = await tx.browserFixtureMaterial.findFirst({
        where: key,
        orderBy: { revision: 'desc' },
        select: { id: true },
      });
      if (reviewId && !existing) throw denied();
      return { device: key.fixtureDevice, existing: !!existing && existing.id !== reviewId };
    });
    if (!target) throw denied();
    return target;
  }

  async finish(
    job: UserJob,
    workerId: string,
    proof?: {
      title: string;
      goal: string;
      preparation: string;
      practice: string;
      checkpoint: string;
      verifiedAt: Date;
      semanticDigest: string;
      steps: Omit<Prisma.BrowserFixtureMaterialStepCreateManyInput, 'materialId'>[];
    },
  ) {
    const { id, actor, reviewId } = await this.jobActor(job);
    const material = await this.use(actor, async (tx, key, currentId, target) => {
      if (target.kind !== 'practice-note') throw denied();
      if (!reviewId && id !== currentId) throw denied();
      const current = await tx.browserFixtureMaterial.findFirst({
        where: key,
        orderBy: { revision: 'desc' },
        select: { id: true, revision: true, semanticDigest: true },
      });
      await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
      if (!proof || (current && current.id !== reviewId)) {
        if (!current) throw denied();
        return current;
      }
      if (current && current.semanticDigest && current.semanticDigest === proof.semanticDigest) {
        return tx.browserFixtureMaterial.update({
          where: { id: current.id },
          data: { reviewedAt: proof.verifiedAt },
          select: { id: true },
        });
      }
      const { steps, ...content } = proof;
      return tx.browserFixtureMaterial.create({
        data: {
          ...key,
          ...content,
          revision: (current?.revision ?? 0) + 1,
          sourceJobId: job.id,
          sourceAttempt: job.attemptCount,
          steps: { create: steps },
        },
        select: { id: true },
      });
    });
    if (!material) throw denied();
    return material;
  }
}
