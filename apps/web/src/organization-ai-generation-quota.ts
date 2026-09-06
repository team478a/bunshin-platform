import 'server-only';
import {
  FinishOrganizationAiGeneration,
  ReserveOrganizationAiGeneration,
  type OrganizationAiGenerationReservationRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

export async function withOrganizationAiGenerationQuota<T>(input: {
  workspaceId: string;
  groupId?: string | null;
  operationKey: string;
  generate(): Promise<T>;
  repository?: OrganizationAiGenerationReservationRepository;
  serviceRepository?: ServiceAiGenerationQuotaRepository;
}): Promise<T> {
  const serviceRepository = input.serviceRepository ?? prismaServiceAiGenerationQuotaRepository;
  const serviceReservation = input.groupId
    ? await serviceRepository.reserve({
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        operationKey: input.operationKey,
      })
    : null;
  if (serviceReservation?.status === 'EXHAUSTED') {
    throw new ApplicationError('FORBIDDEN', 'service monthly AI generation limit reached');
  }
  const repository =
    input.repository ??
    new (await import('@bunshin/database')).PrismaOrganizationAiGenerationReservationRepository();
  let reservation;
  try {
    reservation = await new ReserveOrganizationAiGeneration(repository).execute({
      workspaceId: input.workspaceId,
      operationKey: input.operationKey,
    });
  } catch (error) {
    await finishServiceAiGeneration(serviceRepository, serviceReservation, 'RELEASED');
    throw error;
  }

  if (reservation.status === 'EXHAUSTED') {
    await finishServiceAiGeneration(serviceRepository, serviceReservation, 'RELEASED');
    throw new ApplicationError('FORBIDDEN', 'organization monthly AI generation limit reached');
  }

  const ownsReservation = reservation.status === 'RESERVED';
  try {
    const result = await input.generate();
    if (ownsReservation) {
      await new FinishOrganizationAiGeneration(repository).execute({
        workspaceId: input.workspaceId,
        operationKey: input.operationKey,
        outcome: 'CONSUMED',
      });
    }
    await finishServiceAiGeneration(serviceRepository, serviceReservation, 'CONSUMED');
    return result;
  } catch (error) {
    if (ownsReservation) {
      await new FinishOrganizationAiGeneration(repository).execute({
        workspaceId: input.workspaceId,
        operationKey: input.operationKey,
        outcome: 'RELEASED',
      });
    }
    await finishServiceAiGeneration(serviceRepository, serviceReservation, 'RELEASED');
    throw error;
  }
}

export type ServiceAiGenerationReservation = {
  status: 'UNLIMITED' | 'ALREADY_RESERVED' | 'RESERVED' | 'EXHAUSTED';
  id: string | null;
};

export interface ServiceAiGenerationQuotaRepository {
  reserve(input: {
    workspaceId: string;
    groupId: string;
    operationKey: string;
  }): Promise<ServiceAiGenerationReservation>;
  finish(input: { reservationId: string; outcome: 'CONSUMED' | 'RELEASED' }): Promise<void>;
}

async function reserveServiceAiGeneration(input: {
  workspaceId: string;
  groupId: string;
  operationKey: string;
}): Promise<ServiceAiGenerationReservation> {
  const db = await import('@bunshin/database');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000);
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return db.prisma.$transaction(
    async (tx) => {
      const setting = await tx.serviceCommercialSetting.findFirst({
        where: { workspaceId: input.workspaceId, groupId: input.groupId },
        select: {
          status: true,
          monthlyAiGenerationLimit: true,
          startsAt: true,
          endsAt: true,
        },
      });
      if (!setting || setting.status === 'DRAFT' || setting.monthlyAiGenerationLimit === null) {
        return { status: 'UNLIMITED', id: null };
      }
      if (
        setting.status !== 'ACTIVE' ||
        (setting.startsAt && setting.startsAt > now) ||
        (setting.endsAt && setting.endsAt <= now)
      ) {
        return { status: 'EXHAUSTED', id: null };
      }
      const existing = await tx.serviceAiGenerationReservation.findUnique({
        where: {
          workspaceId_groupId_operationKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            operationKey: input.operationKey,
          },
        },
      });
      if (
        existing?.status === 'CONSUMED' ||
        (existing?.status === 'RESERVED' && existing.expiresAt > now)
      ) {
        return { status: 'ALREADY_RESERVED', id: existing.id };
      }
      const used = await tx.serviceAiGenerationReservation.count({
        where: {
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          monthKey,
          OR: [{ status: 'CONSUMED' }, { status: 'RESERVED', expiresAt: { gt: now } }],
        },
      });
      if (used >= setting.monthlyAiGenerationLimit) {
        return { status: 'EXHAUSTED', id: null };
      }
      const saved = await tx.serviceAiGenerationReservation.upsert({
        where: {
          workspaceId_groupId_operationKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            operationKey: input.operationKey,
          },
        },
        create: { ...input, monthKey, expiresAt },
        update: {
          monthKey,
          status: 'RESERVED',
          expiresAt,
          consumedAt: null,
          releasedAt: null,
        },
        select: { id: true },
      });
      return { status: 'RESERVED', id: saved.id };
    },
    { isolationLevel: 'Serializable' },
  );
}

async function finishServiceAiGeneration(
  repository: ServiceAiGenerationQuotaRepository,
  reservation: ServiceAiGenerationReservation | null,
  outcome: 'CONSUMED' | 'RELEASED',
) {
  if (reservation?.status !== 'RESERVED' || !reservation.id) return;
  await repository.finish({ reservationId: reservation.id, outcome });
}

const prismaServiceAiGenerationQuotaRepository: ServiceAiGenerationQuotaRepository = {
  reserve: reserveServiceAiGeneration,
  async finish({ reservationId, outcome }) {
    const db = await import('@bunshin/database');
    await db.prisma.serviceAiGenerationReservation.updateMany({
      where: { id: reservationId, status: 'RESERVED' },
      data:
        outcome === 'CONSUMED'
          ? { status: 'CONSUMED', consumedAt: new Date() }
          : { status: 'RELEASED', releasedAt: new Date() },
    });
  },
};
