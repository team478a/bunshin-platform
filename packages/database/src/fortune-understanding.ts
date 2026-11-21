import { randomUUID } from 'node:crypto';
import {
  fortuneDeepReadingEnabled,
  fortuneIntakeOptions,
  parseConfirmedFortuneUnderstanding,
  type ConfirmedFortuneUnderstanding,
  type FortuneUnderstandingSnapshot,
} from '@bunshin/capability-fortune';
import type { Prisma } from '@prisma/client';
import { clearFortuneUnderstanding, fortuneReadingRetentionCutoff } from './fortune-retention';
import { fortuneTarget } from './fortune-shared';

type Actor = { serviceSlug: string; actorUserId: string };

export class PrismaFortuneUnderstandingRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly now = () => new Date(),
  ) {}

  private async participant(input: Actor) {
    const scope = await fortuneTarget(this.db, input.serviceSlug, input.actorUserId);
    if (!scope) return null;
    const where = {
      workspaceId: scope.workspaceId,
      groupId: scope.groupId,
      serviceSettingId: scope.id,
      userId: input.actorUserId,
      groupMembership: { status: 'ACTIVE' as const, consentedAt: { not: null } },
    };
    const participant = await this.db.fortuneParticipant.findFirst({
      where,
      select: {
        id: true,
        profileConsentedAt: true,
        profileUpdatedAt: true,
        understandingItems: true,
        understandingRevision: true,
        understandingSavedAt: true,
        understandingExpiresAt: true,
      },
    });
    if (!participant) return null;
    const now = this.now();
    const days = scope.historyRetentionDays;
    const cutoff = fortuneReadingRetentionCutoff(now, days);
    const profileRevision =
      participant.profileConsentedAt &&
      participant.profileUpdatedAt &&
      participant.profileUpdatedAt >= cutoff
        ? participant.profileUpdatedAt
        : null;
    const profileExpiresAt =
      profileRevision && new Date(profileRevision.getTime() + days * 86_400_000);
    const visible = Boolean(
      profileExpiresAt &&
      profileExpiresAt > now &&
      participant.understandingExpiresAt &&
      participant.understandingExpiresAt > now &&
      participant.understandingSavedAt &&
      participant.understandingSavedAt >= cutoff,
    );
    const canSave = Boolean(
      scope.personalProfileEnabled &&
      fortuneIntakeOptions(scope.guidanceSettings).enabled &&
      profileExpiresAt &&
      profileExpiresAt > now,
    );
    return {
      participant,
      where,
      now,
      days,
      profileRevision,
      profileExpiresAt,
      visible,
      canSave,
      canGenerate: canSave && scope.aiEnabled && fortuneDeepReadingEnabled(scope.guidanceSettings),
    };
  }

  async read(input: Actor, forGeneration = false): Promise<FortuneUnderstandingSnapshot | null> {
    const result = await this.participant(input);
    if (!result || (forGeneration && !result.canGenerate)) return null;
    const { participant, visible, canSave, profileRevision, profileExpiresAt } = result;
    const stored = Array.isArray(participant.understandingItems)
      ? participant.understandingItems
      : [];
    return {
      items: visible
        ? stored.map(parseConfirmedFortuneUnderstanding).filter((item) => item !== null)
        : [],
      revision: participant.understandingRevision,
      profileRevision: canSave ? (profileRevision?.toISOString() ?? null) : null,
      savedAt: visible ? (participant.understandingSavedAt?.toISOString() ?? null) : null,
      expiresAt:
        visible && profileExpiresAt && participant.understandingExpiresAt
          ? new Date(
              Math.min(profileExpiresAt.getTime(), participant.understandingExpiresAt.getTime()),
            ).toISOString()
          : null,
      canSave,
    };
  }

  async save(
    input: Actor & {
      revision: string | null;
      profileRevision: Date;
      items: ConfirmedFortuneUnderstanding[];
    },
  ) {
    const result = await this.participant(input);
    if (!result?.canSave || !result.profileExpiresAt || !result.profileRevision)
      return 'UNAVAILABLE';
    const { participant, where, now, days, profileRevision } = result;
    if (
      profileRevision.getTime() !== input.profileRevision.getTime() ||
      participant.understandingRevision !== input.revision
    )
      return 'CONFLICT';
    const priorExpiry = result.visible ? participant.understandingExpiresAt : null;
    const expiresAt =
      priorExpiry && priorExpiry < result.profileExpiresAt ? priorExpiry : result.profileExpiresAt;
    const saved = await this.db.fortuneParticipant.updateMany({
      where: {
        ...where,
        id: participant.id,
        profileConsentedAt: { not: null },
        profileUpdatedAt: profileRevision,
        understandingRevision: input.revision,
        serviceSetting: {
          enabled: true,
          personalProfileEnabled: true,
          historyRetentionDays: days,
          guidanceSettings: { path: ['intake', 'enabled'], equals: true },
        },
      },
      data: {
        understandingItems: input.items,
        understandingRevision: randomUUID(),
        understandingSavedAt: now,
        understandingExpiresAt: expiresAt,
      },
    });
    return saved.count === 1 ? 'SAVED' : 'CONFLICT';
  }

  async delete(input: Actor) {
    const result = await this.participant(input);
    if (!result) return false;
    const deleted = await this.db.fortuneParticipant.updateMany({
      where: { ...result.where, id: result.participant.id },
      data: { ...clearFortuneUnderstanding, understandingRevision: randomUUID() },
    });
    return deleted.count === 1;
  }
}
