import {
  BROWSER_FIXTURE_JOB_TYPE,
  CompleteJob,
  type PersonalLearningActor,
  type UserJob,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaJobRepository } from './automation-jobs';
import { PrismaBrowserLearningMaterials } from './browser-learning-material';

const environment = 'DEVELOPMENT';
const version = 1;
const jobType = BROWSER_FIXTURE_JOB_TYPE;
const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const refPattern = new RegExp('^browser-video:(' + uuid + ')(?::(' + uuid + '))?$', 'i');
const absent = () => new ApplicationError('NOT_FOUND', 'browser lesson video unavailable');
const keyFor = (materialId: string) => ({ materialId, version });
const identity = (materialId: string) => 'browser-video:' + version + ':' + materialId;

type Owner = { workspaceId: string; actorId: string };
type VideoActor =
  { kind: 'owner'; owner: Owner } | { kind: 'learner'; learner: PersonalLearningActor };
type Work<T> = (tx: Prisma.TransactionClient, requestId?: string) => Promise<T>;

export function privateBrowserMaterialScope(owner: Owner) {
  const membership = {
    status: 'ACTIVE' as const,
    workspace: { status: 'ACTIVE' as const },
    user: { status: 'ACTIVE' as const },
  };
  return {
    OR: [
      { recipe: { ...owner, membership } },
      { workspaceId: owner.workspaceId, importedBy: owner.actorId, importer: membership },
    ],
  };
}

export class PrismaBrowserMaterialVideos extends PrismaBrowserLearningMaterials {
  constructor(private readonly videoDb: PrismaClient) {
    super(videoDb);
  }

  private inScope<T>(actor: VideoActor, materialId: string, work: Work<T>, write = false) {
    if (process.env['APP_ENV'] !== 'development') return Promise.resolve(null);
    if (actor.kind === 'learner') {
      return this.use(
        actor.learner,
        async (tx, key, requestId) => {
          const material = await tx.browserFixtureMaterial.findFirst({
            where: { ...key, id: materialId },
            select: { id: true },
          });
          return material ? work(tx, requestId) : null;
        },
        write,
      );
    }
    const owner = actor.owner;
    return this.videoDb.$transaction(async (tx) => {
      if (write) {
        const active = await tx.$queryRaw<{ id: string }[]>`
          SELECT m.id FROM workspace_memberships m
          JOIN workspaces w ON w.id = m.workspace_id JOIN users u ON u.id = m.user_id
          WHERE m.workspace_id = ${owner.workspaceId}::uuid AND m.user_id = ${owner.actorId}::uuid
            AND m.status::text = 'ACTIVE' AND w.status::text = 'ACTIVE' AND u.status::text = 'ACTIVE'
          FOR UPDATE OF m FOR SHARE OF w, u`;
        if (!active.length) return null;
      }
      const material = await tx.browserFixtureMaterial.findFirst({
        where: { id: materialId, ...privateBrowserMaterialScope(owner) },
        select: { id: true },
      });
      return material ? work(tx) : null;
    });
  }

  state(actor: VideoActor, materialId: string) {
    return this.inScope(actor, materialId, async (tx) => {
      const asset = await tx.browserFixtureMaterialVideo.findUnique({
        where: { materialId_version: keyFor(materialId) },
        select: { durationMs: true },
      });
      if (asset) return { ready: true, status: null };
      const job = await tx.job.findUnique({
        where: {
          environment_idempotencyKey: { environment, idempotencyKey: identity(materialId) },
        },
        select: { status: true },
      });
      return { ready: false, status: job?.status ?? null };
    });
  }

  enqueueVideo(actor: VideoActor, materialId: string) {
    return this.inScope(
      actor,
      materialId,
      async (tx, requestId) => {
        const asset = await tx.browserFixtureMaterialVideo.findUnique({
          where: { materialId_version: keyFor(materialId) },
          select: { materialId: true },
        });
        if (asset) return;
        const workspaceId =
          actor.kind === 'owner' ? actor.owner.workspaceId : actor.learner.scope.workspaceId;
        const requestedBy =
          actor.kind === 'owner' ? actor.owner.actorId : actor.learner.actorUserId;
        const idempotencyKey = identity(materialId);
        const payloadReference = 'browser-video:' + materialId + (requestId ? ':' + requestId : '');
        const job = await tx.job.upsert({
          where: { environment_idempotencyKey: { environment, idempotencyKey } },
          create: {
            environment,
            jobType,
            workspaceId,
            requestedBy,
            idempotencyKey,
            payloadReference,
            correlationId: materialId,
            maxAttempts: 3,
          },
          update: {},
          select: { id: true },
        });
        await tx.job.updateMany({
          where: { id: job.id, status: { in: ['DEAD', 'CANCELLED'] } },
          data: {
            status: 'PENDING',
            requestedBy,
            payloadReference,
            attemptCount: 0,
            scheduledAt: new Date(),
            nextRetryAt: null,
            cancelledAt: null,
            lastErrorCategory: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
      },
      true,
    );
  }

  readFile(actor: VideoActor, materialId: string, variant: 'mp4' | 'captions' | 'chapters') {
    return this.inScope(actor, materialId, async (tx) => {
      const asset = await tx.browserFixtureMaterialVideo.findUnique({
        where: { materialId_version: keyFor(materialId) },
        select: {
          mp4: variant === 'mp4',
          captions: variant === 'captions',
          chapters: variant === 'chapters',
        },
      });
      return asset?.[variant] ?? null;
    });
  }

  private async videoJob(job: UserJob) {
    const [, materialId, requestId] = refPattern.exec(job.payloadReference) ?? [];
    if (
      !materialId ||
      job.environment !== environment ||
      job.jobType !== jobType ||
      job.bunshinId ||
      job.capabilityType
    )
      throw absent();
    const actor: VideoActor = requestId
      ? {
          kind: 'learner',
          learner: (
            await this.jobActor({ ...job, payloadReference: 'training-material:' + requestId })
          ).actor,
        }
      : { kind: 'owner', owner: { workspaceId: job.workspaceId, actorId: job.requestedBy } };
    return { materialId, actor };
  }

  async renderInput(job: UserJob) {
    const { actor, materialId } = await this.videoJob(job);
    const result = await this.inScope(actor, materialId, async (tx) => {
      const existing = await tx.browserFixtureMaterialVideo.findUnique({
        where: { materialId_version: keyFor(materialId) },
        select: { materialId: true },
      });
      if (existing) return [];
      return tx.browserFixtureMaterialStep.findMany({
        where: { materialId },
        orderBy: { ordinal: 'asc' },
        select: { instruction: true, beforeImage: true, afterImage: true, detailImage: true },
      });
    });
    if (!result) throw absent();
    return result;
  }

  async finishVideo(
    job: UserJob,
    workerId: string,
    video?: {
      mp4: Uint8Array<ArrayBuffer>;
      captions: string;
      chapters: string;
      durationMs: number;
    },
  ) {
    const { actor, materialId } = await this.videoJob(job);
    const completed = await this.inScope(
      actor,
      materialId,
      async (tx) => {
        await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
        const key = keyFor(materialId);
        if (video) {
          await tx.browserFixtureMaterialVideo.upsert({
            where: { materialId_version: key },
            create: { ...key, ...video },
            update: {},
          });
        } else {
          const existing = await tx.browserFixtureMaterialVideo.findUnique({
            where: { materialId_version: key },
            select: { materialId: true },
          });
          if (!existing) throw absent();
        }
        return true;
      },
      true,
    );
    if (!completed) throw absent();
  }
}
