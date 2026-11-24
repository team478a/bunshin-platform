import {
  BROWSER_FIXTURE_JOB_TYPE,
  CompleteJob,
  type PersonalLearningActor,
  type UserJob,
} from '@bunshin/application';
import {
  browserLearningDevice,
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
  personalLearningOfferPolicy,
} from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaJobRepository } from './automation-jobs';
import { PrismaPersonalLearningPersistenceRepository } from './personal-learning-persistence';

const environment = 'DEVELOPMENT';
const jobType = BROWSER_FIXTURE_JOB_TYPE;
const revision = 1;
const prefix = 'training-material';
const identity = (id: string) => `${prefix}:${id}`;
const jobPattern =
  /^training-material:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const denied = () => new ApplicationError('NOT_FOUND', 'training browser material unavailable');
type MaterialKey = {
  workspaceId: string;
  groupId: string;
  programId: string;
  fixtureDevice: 'desktop' | 'mobile';
  revision: number;
};
const selection = {
  id: true,
  title: true,
  goal: true,
  preparation: true,
  practice: true,
  checkpoint: true,
  verifiedAt: true,
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
    work: (tx: Prisma.TransactionClient, key: MaterialKey, requestId: string) => Promise<T>,
  ) {
    if (process.env['APP_ENV'] !== 'development') return null;
    return this.authorized(actor, true, async (tx) => {
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
      const fixtureDevice = request && browserLearningDevice(request);
      if (!request || !fixtureDevice) return null;
      const key = {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        programId: program.id,
        fixtureDevice,
        revision,
      };
      return work(tx, key, request.id);
    });
  }

  private async use<T>(
    actor: PersonalLearningActor,
    work: (tx: Prisma.TransactionClient, key: MaterialKey, requestId: string) => Promise<T>,
  ) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.authorizedMaterial(actor, work);
      } catch (error) {
        if (attempt === 3 || !(error instanceof ApplicationError) || error.code !== 'CONFLICT')
          throw error;
      }
    }
  }
  readMaterial(actor: PersonalLearningActor) {
    return this.use(actor, async (tx, key, requestId) => {
      const material = await tx.browserFixtureMaterial.findFirst({ where: key, select: selection });
      const job = material
        ? null
        : await tx.job.findFirst({
            where: {
              environment,
              jobType,
              workspaceId: key.workspaceId,
              requestedBy: actor.actorUserId,
              idempotencyKey: identity(requestId),
            },
            select: { status: true },
          });
      return { device: key.fixtureDevice, material, status: job?.status ?? null };
    });
  }

  enqueue(actor: PersonalLearningActor) {
    return this.use(actor, async (tx, key, requestId) => {
      if (await tx.browserFixtureMaterial.findFirst({ where: key, select: { id: true } })) return;
      const reference = identity(requestId);
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
          maxAttempts: 3,
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
    return this.use(actor, async (tx, key) => {
      const step = await tx.browserFixtureMaterialStep.findFirst({
        where: { materialId, ordinal, material: key },
        select: { [column]: true },
      });
      return step?.[column] ?? null;
    });
  }

  private async jobActor(job: UserJob) {
    const id = jobPattern.exec(job.payloadReference)?.[1];
    if (
      process.env['APP_ENV'] !== 'development' ||
      !id ||
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
    return { id, actor: { actorUserId: job.requestedBy, scope, ...(topicId ? { topicId } : {}) } };
  }

  async jobMaterial(job: UserJob) {
    const { id, actor } = await this.jobActor(job);
    const target = await this.use(actor, async (tx, key, currentId) => {
      if (id !== currentId) throw denied();
      const existing = await tx.browserFixtureMaterial.findFirst({
        where: key,
        select: { id: true },
      });
      return { device: key.fixtureDevice, existing: existing !== null };
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
      steps: Omit<Prisma.BrowserFixtureMaterialStepCreateManyInput, 'materialId'>[];
    },
  ) {
    const { id, actor } = await this.jobActor(job);
    const material = await this.use(actor, async (tx, key, currentId) => {
      if (id !== currentId) throw denied();
      await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
      if (!proof) {
        const existing = await tx.browserFixtureMaterial.findFirst({
          where: key,
          select: { id: true },
        });
        if (!existing) throw denied();
        return existing;
      }
      const { steps, ...content } = proof;
      return tx.browserFixtureMaterial.upsert({
        where: { workspaceId_groupId_programId_fixtureDevice_revision: key },
        create: {
          ...key,
          ...content,
          sourceJobId: job.id,
          sourceAttempt: job.attemptCount,
          steps: { create: steps },
        },
        update: {},
        select: { id: true },
      });
    });
    if (!material) throw denied();
    return material;
  }
}
