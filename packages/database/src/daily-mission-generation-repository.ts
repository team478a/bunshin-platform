import { ApplicationError } from '@bunshin/shared';
import { GENERATION_TRIGGERS, type GenerationTrigger } from '@bunshin/platform-domain';
import { Prisma, type PrismaClient, prisma } from './client';

export class PrismaDailyMissionGenerationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async claim(input: {
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    missionDate: string;
    idempotencyKey: string;
    generationTrigger?: GenerationTrigger;
  }) {
    const generationTrigger =
      input.generationTrigger === undefined ? 'UNKNOWN' : input.generationTrigger;
    if (!GENERATION_TRIGGERS.includes(generationTrigger))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid generation trigger');
    const authorized = await this.client.bunshin.findFirst({
      where: {
        id: input.bunshinId,
        workspaceId: input.workspaceId,
        status: { not: 'ARCHIVED' },
        workspace: {
          status: 'ACTIVE',
          memberships: { some: { userId: input.actorUserId, status: 'ACTIVE' } },
        },
      },
      select: { id: true },
    });
    if (!authorized) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    const missionDate = new Date(`${input.missionDate}T00:00:00.000Z`);
    try {
      return {
        record: await this.client.dailyMissionGeneration.create({
          data: {
            workspaceId: input.workspaceId,
            bunshinId: input.bunshinId,
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
            missionDate,
            status: 'PENDING',
            generationTrigger,
          },
        }),
        acquired: true,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.client.dailyMissionGeneration.findFirst({
        where: { workspaceId: input.workspaceId, bunshinId: input.bunshinId, missionDate },
      });
      if (!existing) throw error;
      if (existing.actorUserId !== input.actorUserId)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      if (existing.status === 'FAILED') {
        // A new attempt owns its origin. Only one concurrent retry can acquire it.
        const retry = await this.client.dailyMissionGeneration.updateMany({
          where: { id: existing.id, status: 'FAILED', updatedAt: existing.updatedAt },
          data: {
            status: 'PENDING',
            idempotencyKey: input.idempotencyKey,
            errorCategory: null,
            generationTrigger,
          },
        });
        if (retry.count !== 1)
          throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
        return {
          record: await this.client.dailyMissionGeneration.findUniqueOrThrow({
            where: { id: existing.id },
          }),
          acquired: true,
        };
      }
      if (existing.idempotencyKey !== input.idempotencyKey)
        throw new ApplicationError('CONFLICT', 'daily mission generation already claimed');
      return { record: existing, acquired: false };
    }
  }

  async complete(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    dailyMissionId: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'COMPLETED', dailyMissionId: input.dailyMissionId, errorCategory: null },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }

  async fail(input: {
    id: string;
    workspaceId: string;
    bunshinId: string;
    actorUserId: string;
    errorCategory: string;
  }) {
    const result = await this.client.dailyMissionGeneration.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        actorUserId: input.actorUserId,
      },
      data: { status: 'FAILED', errorCategory: input.errorCategory },
    });
    if (result.count !== 1) throw new ApplicationError('NOT_FOUND', 'generation not found');
  }
}
