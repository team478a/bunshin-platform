import type { VideoDisclosurePolicy, VideoDisclosurePolicyRepository } from '@bunshin/application';
import { Prisma, type PrismaClient, prisma } from './client';

const videoDisclosurePolicyRecord = (
  row: Prisma.VideoDisclosurePolicyGetPayload<object>,
): VideoDisclosurePolicy => ({
  ...row,
  hashtags: row.hashtags as string[],
  outputMetadata: row.outputMetadata as Record<string, string>,
});

export class PrismaVideoDisclosurePolicyRepository implements VideoDisclosurePolicyRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async list(input: Parameters<VideoDisclosurePolicyRepository['list']>[0]) {
    const rows = await this.client.videoDisclosurePolicy.findMany({
      where: { environment: input.environment },
      orderBy: [{ platform: 'asc' }, { version: 'desc' }],
    });
    return rows.map(videoDisclosurePolicyRecord);
  }

  async createDraft(input: Parameters<VideoDisclosurePolicyRepository['createDraft']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const latest = await tx.videoDisclosurePolicy.aggregate({
          where: { environment: input.environment, platform: input.platform },
          _max: { version: true },
        });
        const created = await tx.videoDisclosurePolicy.create({
          data: {
            environment: input.environment,
            platform: input.platform,
            version: (latest._max.version ?? 0) + 1,
            disclosureText: input.disclosureText,
            hashtags: input.hashtags,
            guidance: input.guidance,
            outputMetadata: input.outputMetadata,
            changeReason: input.changeReason,
            createdByUserId: input.actorUserId,
            createdAt: input.now,
          },
        });
        return videoDisclosurePolicyRecord(created);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async activate(input: Parameters<VideoDisclosurePolicyRepository['activate']>[0]) {
    return this.client.$transaction(
      async (tx) => {
        const target = await tx.videoDisclosurePolicy.findUnique({ where: { id: input.policyId } });
        if (!target || target.environment !== input.environment || target.status !== 'DRAFT')
          return null;
        await tx.videoDisclosurePolicy.updateMany({
          where: {
            environment: target.environment,
            platform: target.platform,
            status: 'ACTIVE',
          },
          data: { status: 'SUPERSEDED', supersededAt: input.now },
        });
        const activated = await tx.videoDisclosurePolicy.update({
          where: { id: target.id },
          data: {
            status: 'ACTIVE',
            activationReason: input.activationReason,
            activatedByUserId: input.actorUserId,
            activatedAt: input.now,
          },
        });
        return videoDisclosurePolicyRecord(activated);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findActive(input: Parameters<VideoDisclosurePolicyRepository['findActive']>[0]) {
    const found = await this.client.videoDisclosurePolicy.findFirst({
      where: { environment: input.environment, platform: input.platform, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    return found ? videoDisclosurePolicyRecord(found) : null;
  }
}
