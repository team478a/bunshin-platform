import {
  emptyFortunePersonalProfile,
  FORTUNE_PROFILE_STYLES,
  type FortunePersonalProfileUpdate,
} from '@bunshin/capability-fortune';
import type { Prisma, PrismaClient } from '@prisma/client';
import { fortuneReadingRetentionCutoff } from './fortune-retention';
import { fortuneTarget } from './fortune-shared';
import { eraseFortuneFollowUps } from './fortune-follow-ups';

interface ActorScope {
  serviceSlug: string;
  actorUserId: string;
}

export class PrismaFortunePersonalProfileRepository {
  constructor(
    private readonly db: PrismaClient | Prisma.TransactionClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(input: ActorScope) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        serviceSettingId: scope.id,
        userId: input.actorUserId,
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      },
      select: {
        profileInterest: true,
        profileQuestion: true,
        profileStyle: true,
        profileUpdatedAt: true,
        profileConsentedAt: true,
        notificationWeekday: true,
        notificationHour: true,
      },
    });
    if (!participant) return null;
    const active =
      participant.profileConsentedAt !== null &&
      participant.profileUpdatedAt !== null &&
      participant.profileUpdatedAt >=
        fortuneReadingRetentionCutoff(this.now(), scope.historyRetentionDays);
    return {
      enabled: scope.personalProfileEnabled,
      completed: Boolean(participant.profileUpdatedAt),
      revision: active ? participant.profileUpdatedAt : null,
      notificationSlot:
        typeof participant.notificationWeekday === 'number' &&
        typeof participant.notificationHour === 'number'
          ? { weekday: participant.notificationWeekday, hour: participant.notificationHour }
          : null,
      profile: active
        ? {
            interest: participant.profileInterest,
            question: participant.profileQuestion,
            style:
              FORTUNE_PROFILE_STYLES.find((style) => style === participant.profileStyle) ?? null,
            consented: true,
          }
        : emptyFortunePersonalProfile,
    };
  }

  async saveNotificationSlot(
    input: ActorScope & { slot: { weekday: number; hour: number } | null },
  ) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope?.personalProfileEnabled || !scope.weeklyNotificationEnabled) return false;
    const result = await this.db.fortuneParticipant.updateMany({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        serviceSettingId: scope.id,
        userId: input.actorUserId,
        groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
        serviceSetting: {
          enabled: true,
          personalProfileEnabled: true,
          weeklyNotificationEnabled: true,
        },
      },
      data: {
        notificationWeekday: input.slot?.weekday ?? null,
        notificationHour: input.slot?.hour ?? null,
      },
    });
    return result.count === 1;
  }

  async update(input: ActorScope & { profile: FortunePersonalProfileUpdate }) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope || (input.profile.consented && !scope.personalProfileEnabled)) return false;
    const now = this.now();
    const { profile } = input;
    const save = async (db: Prisma.TransactionClient) => {
      const result = await db.fortuneParticipant.updateMany({
        where: {
          workspaceId: scope.workspaceId,
          groupId: scope.groupId,
          serviceSettingId: scope.id,
          userId: input.actorUserId,
          groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
          serviceSetting: {
            enabled: true,
            ...(profile.consented ? { personalProfileEnabled: true } : {}),
          },
        },
        data: {
          profileInterest: profile.consented ? profile.interest : null,
          profileQuestion: profile.consented ? profile.question : null,
          profileStyle: profile.consented ? profile.style : null,
          profileConsentedAt: profile.consented ? now : null,
          profileUpdatedAt: now,
        },
      });
      if (result.count === 1 && !profile.consented) {
        await eraseFortuneFollowUps(db, {
          serviceSettingId: scope.id,
          memberUserId: input.actorUserId,
        });
      }
      return result.count === 1;
    };
    return '$transaction' in this.db ? this.db.$transaction(save) : save(this.db);
  }
}
