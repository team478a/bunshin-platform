import 'server-only';

export type ServiceMediaGenerationKind = 'IMAGE' | 'VIDEO';
export type ServiceMediaGenerationReservation = {
  status: 'NOT_CONFIGURED' | 'RESERVED' | 'ALREADY_RESERVED' | 'ALREADY_CONSUMED' | 'EXHAUSTED';
  id: string | null;
};

export interface ServiceMediaGenerationQuotaRepository {
  reserve: (input: {
    workspaceId: string;
    groupId: string;
    kind: ServiceMediaGenerationKind;
    operationKey: string;
    now: Date;
  }) => Promise<ServiceMediaGenerationReservation>;
  finish: (input: {
    reservationId: string;
    outcome: 'CONSUMED' | 'RELEASED';
    now: Date;
  }) => Promise<void>;
}

export async function reserveServiceMediaGeneration(input: {
  workspaceId: string;
  groupId: string;
  kind: ServiceMediaGenerationKind;
  operationKey: string;
  now?: Date;
  repository?: ServiceMediaGenerationQuotaRepository;
}) {
  return (input.repository ?? prismaServiceMediaGenerationQuotaRepository).reserve({
    workspaceId: input.workspaceId,
    groupId: input.groupId,
    kind: input.kind,
    operationKey: input.operationKey,
    now: input.now ?? new Date(),
  });
}

export async function finishServiceMediaGeneration(input: {
  reservation: ServiceMediaGenerationReservation;
  outcome: 'CONSUMED' | 'RELEASED';
  now?: Date;
  repository?: ServiceMediaGenerationQuotaRepository;
}) {
  if (!input.reservation.id || input.reservation.status === 'NOT_CONFIGURED') return;
  await (input.repository ?? prismaServiceMediaGenerationQuotaRepository).finish({
    reservationId: input.reservation.id,
    outcome: input.outcome,
    now: input.now ?? new Date(),
  });
}

export const prismaServiceMediaGenerationQuotaRepository: ServiceMediaGenerationQuotaRepository = {
  async reserve(input) {
    const db = await import('@bunshin/database');
    const monthKey = `${input.now.getUTCFullYear()}-${String(input.now.getUTCMonth() + 1).padStart(2, '0')}`;
    const expiresAt = new Date(input.now.getTime() + 15 * 60_000);
    return db.prisma.$transaction(
      async (tx) => {
        const setting = await tx.serviceCommercialSetting.findFirst({
          where: { workspaceId: input.workspaceId, groupId: input.groupId },
          select: {
            status: true,
            monthlyImageGenerationLimit: true,
            monthlyVideoGenerationLimit: true,
            startsAt: true,
            endsAt: true,
          },
        });
        const limit =
          input.kind === 'IMAGE'
            ? setting?.monthlyImageGenerationLimit
            : setting?.monthlyVideoGenerationLimit;
        if (!setting || setting.status === 'DRAFT' || limit === null || limit === undefined)
          return { status: 'NOT_CONFIGURED', id: null } as const;
        if (
          setting.status !== 'ACTIVE' ||
          (setting.startsAt && setting.startsAt > input.now) ||
          (setting.endsAt && setting.endsAt <= input.now)
        )
          return { status: 'EXHAUSTED', id: null } as const;

        const key = {
          workspaceId_groupId_kind_operationKey: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            kind: input.kind,
            operationKey: input.operationKey,
          },
        } as const;
        const existing = await tx.serviceMediaGenerationReservation.findUnique({ where: key });
        if (existing?.status === 'CONSUMED')
          return { status: 'ALREADY_CONSUMED', id: existing.id } as const;
        if (existing?.status === 'RESERVED' && existing.expiresAt > input.now)
          return { status: 'ALREADY_RESERVED', id: existing.id } as const;

        const used = await tx.serviceMediaGenerationReservation.count({
          where: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            kind: input.kind,
            monthKey,
            OR: [{ status: 'CONSUMED' }, { status: 'RESERVED', expiresAt: { gt: input.now } }],
          },
        });
        if (used >= limit) return { status: 'EXHAUSTED', id: null } as const;

        const saved = await tx.serviceMediaGenerationReservation.upsert({
          where: key,
          create: {
            workspaceId: input.workspaceId,
            groupId: input.groupId,
            kind: input.kind,
            monthKey,
            operationKey: input.operationKey,
            expiresAt,
          },
          update: {
            monthKey,
            status: 'RESERVED',
            expiresAt,
            consumedAt: null,
            releasedAt: null,
          },
          select: { id: true },
        });
        return { status: 'RESERVED', id: saved.id } as const;
      },
      { isolationLevel: 'Serializable' },
    );
  },

  async finish(input) {
    const db = await import('@bunshin/database');
    await db.prisma.serviceMediaGenerationReservation.updateMany({
      where: {
        id: input.reservationId,
        ...(input.outcome === 'CONSUMED'
          ? { status: 'RESERVED' }
          : { status: { in: ['RESERVED', 'RELEASED'] } }),
      },
      data:
        input.outcome === 'CONSUMED'
          ? { status: 'CONSUMED', consumedAt: input.now }
          : { status: 'RELEASED', releasedAt: input.now },
    });
  },
};
