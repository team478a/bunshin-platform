import {
  BROWSER_FIXTURE_JOB_TYPE,
  CompleteJob,
  type PersonalLearningActor,
  type UserJob,
} from '@bunshin/application';
import {
  browserMaterialAzureProfile,
  browserMaterialAzureVoices,
  browserMaterialVideoVersion as narratedVersion,
  browserPilotEnvironment,
} from '@bunshin/capability-browser';
import { ApplicationError } from '@bunshin/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaJobRepository } from './automation-jobs';
import { PrismaBrowserLearningMaterials } from './browser-learning-material';

const jobType = BROWSER_FIXTURE_JOB_TYPE;
const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const refPattern = new RegExp(
  '^browser-video:(?:v([2-5]):)?(' + uuid + ')(?::(' + uuid + '))?$',
  'i',
);
const absent = () => new ApplicationError('NOT_FOUND', 'browser lesson video unavailable');
const keyFor = (materialId: string, version = narratedVersion) => ({ materialId, version });
const identity = (materialId: string, version: number) => `browser-video:${version}:${materialId}`;

type SpeechJob = Pick<
  UserJob,
  | 'requestedBy'
  | 'workspaceId'
  | 'environment'
  | 'jobType'
  | 'bunshinId'
  | 'capabilityType'
  | 'payloadReference'
>;

type Owner = { workspaceId: string; actorId: string };
type VideoActor =
  { kind: 'owner'; owner: Owner } | { kind: 'learner'; learner: PersonalLearningActor };
type Work<T> = (
  tx: Prisma.TransactionClient,
  environment: NonNullable<ReturnType<typeof browserPilotEnvironment>>,
  requestId?: string,
) => Promise<T>;

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
    const environment = browserPilotEnvironment(process.env['APP_ENV']);
    if (!environment) return Promise.resolve(null);
    if (actor.kind === 'learner') {
      return this.use(
        actor.learner,
        async (tx, key, requestId, target) => {
          const where = this.materialWhere(key, target);
          if (!where) return null;
          const material = await tx.browserFixtureMaterial.findFirst({
            where: { ...where, id: materialId },
            select: { id: true },
          });
          return material ? work(tx, environment, requestId) : null;
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
      return material ? work(tx, environment) : null;
    });
  }

  state(actor: VideoActor, materialId: string, version: number = narratedVersion) {
    return this.inScope(actor, materialId, async (tx, environment) => {
      const assets = await tx.browserFixtureMaterialVideo.findMany({
        where: {
          materialId,
          version: {
            in: [
              1,
              2,
              narratedVersion,
              ...Object.values(browserMaterialAzureVoices).map((voice) => voice.version),
            ],
          },
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      if (assets.some((asset) => asset.version === version)) return { version, status: null };
      const job = await tx.job.findUnique({
        where: {
          environment_idempotencyKey: {
            environment,
            idempotencyKey: identity(materialId, version),
          },
        },
        select: { status: true },
      });
      return { version: assets[0]?.version ?? null, status: job?.status ?? null };
    });
  }

  enqueueVideo(actor: VideoActor, materialId: string, version: number = narratedVersion) {
    if (version !== narratedVersion && !browserMaterialAzureProfile(version)) throw absent();
    return this.inScope(
      actor,
      materialId,
      async (tx, environment, requestId) => {
        if (browserMaterialAzureProfile(version))
          await this.requireAzureScope(tx, actor, materialId);
        const asset = await tx.browserFixtureMaterialVideo.findUnique({
          where: { materialId_version: keyFor(materialId, version) },
          select: { materialId: true },
        });
        if (asset) return;
        const workspaceId =
          actor.kind === 'owner' ? actor.owner.workspaceId : actor.learner.scope.workspaceId;
        const requestedBy =
          actor.kind === 'owner' ? actor.owner.actorId : actor.learner.actorUserId;
        const idempotencyKey = identity(materialId, version);
        const payloadReference =
          'browser-video:v' + version + ':' + materialId + (requestId ? ':' + requestId : '');
        const now = new Date();
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
            scheduledAt: now,
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
            scheduledAt: now,
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

  readFile(
    actor: VideoActor,
    materialId: string,
    variant: 'mp4' | 'captions' | 'chapters',
    version = narratedVersion,
  ) {
    return this.inScope(actor, materialId, async (tx) => {
      const asset = await tx.browserFixtureMaterialVideo.findUnique({
        where: { materialId_version: keyFor(materialId, version) },
        select: {
          mp4: variant === 'mp4',
          captions: variant === 'captions',
          chapters: variant === 'chapters',
        },
      });
      return asset?.[variant] ?? null;
    });
  }

  private async videoJob(job: SpeechJob) {
    const [, voiceVersion, materialId, requestId] = refPattern.exec(job.payloadReference) ?? [];
    const environment = browserPilotEnvironment(process.env['APP_ENV']);
    if (
      !materialId ||
      !environment ||
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
    return { materialId, actor, version: voiceVersion ? Number(voiceVersion) : 1 };
  }

  private async requireAzureScope(
    tx: Prisma.TransactionClient,
    actor: VideoActor,
    materialId: string,
  ) {
    const workspaceId =
      actor.kind === 'owner' ? actor.owner.workspaceId : actor.learner.scope.workspaceId;
    const environment = browserPilotEnvironment(process.env['APP_ENV']);
    if (!environment) throw absent();
    const connection = await tx.browserMaterialSpeechConfiguration.findFirst({
      where: { environment, workspaceId, enabled: true },
      select: { region: true, encryptedKey: true },
    });
    if (!connection) throw absent();
    const verified = await tx.browserFixtureMaterial.findFirst({
      where: { id: materialId, verifiedAt: { not: null }, importedAt: null },
      select: { id: true },
    });
    if (!verified) throw absent();
    return connection;
  }

  async speechAvailability(workspaceId: string) {
    const environment = browserPilotEnvironment(process.env['APP_ENV']);
    if (!environment) return { enabled: false, previews: false };
    const where: Prisma.BrowserMaterialSpeechConfigurationWhereInput = {
      environment,
      workspaceId,
      enabled: true,
    };
    const [enabled, previews] = await Promise.all([
      this.videoDb.browserMaterialSpeechConfiguration.count({ where }),
      this.videoDb.browserMaterialSpeechConfiguration.count({
        where: { ...where, shioriPreview: { not: null }, daichiPreview: { not: null } },
      }),
    ]);
    return { enabled: enabled > 0, previews: previews > 0 };
  }

  async narrationInstruction(job: SpeechJob, ordinal: number) {
    const { actor, materialId, version } = await this.videoJob(job);
    const voice = browserMaterialAzureProfile(version);
    if (!voice) throw absent();
    return this.inScope(actor, materialId, async (tx) => {
      const connection = await this.requireAzureScope(tx, actor, materialId);
      const step = await tx.browserFixtureMaterialStep.findUnique({
        where: { materialId_ordinal: { materialId, ordinal } },
        select: { instruction: true },
      });
      return step
        ? {
            ...connection,
            model: voice.model,
            instruction: step.instruction.replace(/\s+/g, ' ').trim() || '手順 ' + ordinal,
          }
        : null;
    });
  }

  async renderInput(job: UserJob) {
    const { actor, materialId, version } = await this.videoJob(job);
    const result = await this.inScope(actor, materialId, async (tx) => {
      if (browserMaterialAzureProfile(version)) await this.requireAzureScope(tx, actor, materialId);
      const existing = await tx.browserFixtureMaterialVideo.findUnique({
        where: { materialId_version: keyFor(materialId, version) },
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
    const { actor, materialId, version } = await this.videoJob(job);
    const completed = await this.inScope(
      actor,
      materialId,
      async (tx) => {
        await new CompleteJob(new PrismaJobRepository(tx)).execute(job.id, workerId);
        const key = keyFor(materialId, version);
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
