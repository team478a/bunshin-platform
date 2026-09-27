import type { FortuneParticipantView } from '@bunshin/capability-fortune';
import type { PrismaClient } from '@prisma/client';
import { fortuneTarget } from './fortune-shared';

export class PrismaFortuneParticipantRepository {
  constructor(private readonly db: PrismaClient) {}

  async joinParticipant(input: {
    serviceSlug: string;
    actorUserId: string;
    ageConfirmedAt: Date;
  }): Promise<FortuneParticipantView | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      const membership = scope?.group.memberships[0];
      if (!scope || !membership) return null;
      const participant = await tx.fortuneParticipant.upsert({
        where: {
          serviceSettingId_userId: { serviceSettingId: scope.id, userId: input.actorUserId },
        },
        update: {
          groupMembershipId: membership.id,
          ageConfirmedAt: input.ageConfirmedAt,
        },
        create: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          groupMembershipId: membership.id,
          userId: input.actorUserId,
          ageConfirmedAt: input.ageConfirmedAt,
        },
        include: { personalizationBunshin: { select: { id: true, name: true } } },
      });
      return {
        id: participant.id,
        ageConfirmedAt: participant.ageConfirmedAt,
        personalizationBunshin: participant.personalizationBunshin,
      };
    });
  }

  async findParticipant(input: {
    serviceSlug: string;
    actorUserId: string;
  }): Promise<FortuneParticipantView | null> {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: { serviceSettingId: scope.id, userId: input.actorUserId },
      include: { personalizationBunshin: { select: { id: true, name: true } } },
    });
    return participant
      ? {
          id: participant.id,
          ageConfirmedAt: participant.ageConfirmedAt,
          personalizationBunshin: participant.personalizationBunshin,
        }
      : null;
  }

  async updateParticipantPersonalization(input: {
    serviceSlug: string;
    actorUserId: string;
    bunshinId: string | null;
  }): Promise<FortuneParticipantView | null> {
    return this.db.$transaction(async (tx) => {
      const scope = await fortuneTarget(tx, input.serviceSlug, input.actorUserId);
      if (!scope) return null;
      const participant = await tx.fortuneParticipant.findFirst({
        where: { serviceSettingId: scope.id, userId: input.actorUserId },
      });
      if (!participant) return null;
      if (input.bunshinId) {
        const owned = await tx.bunshin.findFirst({
          where: {
            id: input.bunshinId,
            workspaceId: scope.workspaceId,
            groupId: scope.groupId,
            ownerUserId: input.actorUserId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!owned) return null;
      }
      const updated = await tx.fortuneParticipant.update({
        where: { id: participant.id },
        data: { personalizationBunshinId: input.bunshinId },
        include: { personalizationBunshin: { select: { id: true, name: true } } },
      });
      return {
        id: updated.id,
        ageConfirmedAt: updated.ageConfirmedAt,
        personalizationBunshin: updated.personalizationBunshin,
      };
    });
  }
}
