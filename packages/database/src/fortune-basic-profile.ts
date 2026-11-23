import {
  FORTUNE_BASIC_PROFILE_SEXES,
  type FortuneBasicProfile,
  type FortuneBasicProfileFields,
} from '@bunshin/capability-fortune';
import type { FortuneBasicProfile as ProfileRow, Prisma, PrismaClient } from '@prisma/client';
import { dateOnly, fortuneTarget } from './fortune-shared';

type ActorScope = { serviceSlug: string; actorUserId: string };
type ProfileChange =
  { action: 'save'; fields: Partial<FortuneBasicProfileFields> } | { action: 'skip' | 'delete' };

function profileView(row: ProfileRow | null): FortuneBasicProfile | null {
  if (!row) return null;
  return {
    nickname: row.nickname,
    birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null,
    sex: FORTUNE_BASIC_PROFILE_SEXES.find((value) => value === row.sex) ?? null,
    sexDescription: row.sexDescription,
    consentedAt: row.consentedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function targetParticipant(db: Prisma.TransactionClient, input: ActorScope) {
  const scope = await fortuneTarget(db, input.serviceSlug, input.actorUserId);
  const membership = scope?.group.memberships[0];
  if (!scope || !membership) return null;
  return { scope, membership };
}

export class PrismaFortuneBasicProfileRepository {
  constructor(private readonly db: PrismaClient) {}

  async read(input: ActorScope) {
    const target = await targetParticipant(this.db, input);
    if (!target) return null;
    const participant = await this.db.fortuneParticipant.findFirst({
      where: {
        serviceSettingId: target.scope.id,
        userId: input.actorUserId,
        groupMembership: { id: target.membership.id, status: 'ACTIVE', consentedAt: { not: null } },
      },
      select: { basicProfile: true, basicProfileHandledAt: true },
    });
    return participant
      ? {
          profile: profileView(participant.basicProfile),
          completed: participant.basicProfileHandledAt !== null,
        }
      : null;
  }

  async change(input: ActorScope & { change: ProfileChange; now: Date }) {
    return this.db.$transaction(async (tx) => {
      const target = await targetParticipant(tx, input);
      if (!target) return false;
      // Account deletion updates the same user row before erasing profiles.
      const activeUser = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users
        WHERE id = ${input.actorUserId}::uuid AND status = 'ACTIVE'
        FOR SHARE
      `;
      if (!activeUser.length) return false;
      // Withdrawal locks the same membership before erasing the profile.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM group_memberships
        WHERE id = ${target.membership.id}::uuid AND status = 'ACTIVE' AND consented_at IS NOT NULL
        FOR UPDATE
      `;
      if (!locked.length) return false;

      const participant = await tx.fortuneParticipant.findFirst({
        where: {
          serviceSettingId: target.scope.id,
          userId: input.actorUserId,
          groupMembershipId: target.membership.id,
        },
        select: { id: true, basicProfileHandledAt: true, basicProfile: true },
      });
      if (!participant) return false;

      if (input.change.action === 'save') {
        const settings = target.scope.guidanceSettings;
        const policy =
          settings && typeof settings === 'object' && !Array.isArray(settings)
            ? settings.basicProfile
            : null;
        const fields = input.change.fields;
        const values = Object.values(fields);
        const clearing =
          participant.basicProfile && values.length > 0 && values.every((value) => value === null);
        const enabled =
          policy && typeof policy === 'object' && !Array.isArray(policy) && policy.enabled === true
            ? policy
            : null;
        if (!enabled && !clearing) return false;
        if (
          (fields.nickname && enabled?.showNickname === false) ||
          (fields.birthDate && enabled?.showBirthDate === false) ||
          ((fields.sex || fields.sexDescription) && enabled?.showSex === false)
        )
          return false;
        const existing = participant.basicProfile;
        const sex = fields.sex === undefined ? (existing?.sex ?? null) : fields.sex;
        const data = {
          nickname: fields.nickname === undefined ? (existing?.nickname ?? null) : fields.nickname,
          birthDate:
            fields.birthDate === undefined
              ? (existing?.birthDate ?? null)
              : fields.birthDate && dateOnly(fields.birthDate),
          sex,
          sexDescription:
            sex === 'OTHER'
              ? fields.sexDescription === undefined
                ? (existing?.sexDescription ?? null)
                : fields.sexDescription
              : null,
        };
        if (data.nickname || data.birthDate || data.sex) {
          await tx.fortuneBasicProfile.upsert({
            where: { participantId: participant.id },
            create: { participantId: participant.id, consentedAt: input.now, ...data },
            update: data,
          });
        } else if (existing) {
          await tx.fortuneBasicProfile.deleteMany({ where: { participantId: participant.id } });
        }
      } else if (input.change.action === 'delete') {
        await tx.fortuneBasicProfile.deleteMany({ where: { participantId: participant.id } });
      }
      if (!participant.basicProfileHandledAt) {
        await tx.fortuneParticipant.update({
          where: { id: participant.id },
          data: { basicProfileHandledAt: input.now },
        });
      }
      return true;
    });
  }
}
