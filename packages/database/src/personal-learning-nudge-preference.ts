import type { PrismaClient } from '@prisma/client';
import type { PersonalLearningActor } from '@bunshin/application';
import { randomUUID } from 'node:crypto';

export interface PersonalLearningNudgePreferenceInput {
  action: 'ENABLE' | 'PAUSE' | 'STOP' | 'RESUME';
  now: Date;
  pauseUntil?: Date;
  consentVersion?: string;
  consentedAt?: Date;
}

/** All reads/writes are bound to the actor's exact learner, service, enrollment and membership. */
export class PrismaPersonalLearningNudgePreferenceRepository {
  constructor(private readonly client: PrismaClient) {}

  read(actor: PersonalLearningActor) {
    const s = actor.scope;
    return this.client.personalLearningNudgePreference.findFirst({
      where: {
        workspaceId: s.workspaceId,
        groupId: s.groupId,
        programEnrollmentId: s.programEnrollmentId,
        groupMembershipId: s.groupMembershipId,
        userId: s.userId,
      },
      select: {
        enabled: true,
        consentVersion: true,
        consentedAt: true,
        pausedUntil: true,
        stoppedAt: true,
      },
    });
  }

  async update(actor: PersonalLearningActor, input: PersonalLearningNudgePreferenceInput) {
    const s = actor.scope;
    const where = {
      workspaceId: s.workspaceId,
      groupId: s.groupId,
      programEnrollmentId: s.programEnrollmentId,
      groupMembershipId: s.groupMembershipId,
      userId: s.userId,
    };
    if (input.action === 'PAUSE' && (!input.pauseUntil || input.pauseUntil <= input.now))
      throw new Error('invalid pause date');
    const values = {
      ...(input.consentVersion
        ? { consentVersion: input.consentVersion, consentedAt: input.consentedAt ?? input.now }
        : {}),
      ...(input.action === 'ENABLE' ? { enabled: true, stoppedAt: null, pausedUntil: null } : {}),
      ...(input.action === 'PAUSE'
        ? { enabled: true, pausedUntil: input.pauseUntil!, stoppedAt: null }
        : {}),
      ...(input.action === 'STOP'
        ? { enabled: false, stoppedAt: input.now, pausedUntil: null }
        : {}),
      ...(input.action === 'RESUME' ? { enabled: true, stoppedAt: null, pausedUntil: null } : {}),
    };
    return this.client.$transaction(async (tx) => {
      const saved = await tx.personalLearningNudgePreference.upsert({
        where: {
          workspaceId_groupId_programEnrollmentId_groupMembershipId_userId: where,
        },
        create: {
          ...where,
          enabled: input.action !== 'STOP',
          ...(input.consentVersion
            ? { consentVersion: input.consentVersion, consentedAt: input.consentedAt ?? input.now }
            : {}),
          ...(input.action === 'PAUSE' ? { pausedUntil: input.pauseUntil } : {}),
          ...(input.action === 'STOP' ? { stoppedAt: input.now } : {}),
        },
        update: values,
        select: {
          id: true,
          enabled: true,
          consentVersion: true,
          consentedAt: true,
          pausedUntil: true,
          stoppedAt: true,
        },
      });
      await tx.programActionEvent.create({
        data: {
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          programEnrollmentId: s.programEnrollmentId,
          eventType: 'PERSONAL_LEARNING_NUDGE_PREFERENCE_UPDATED',
          sourceResourceType: 'PERSONAL_LEARNING_NUDGE_PREFERENCE',
          sourceResourceId: saved.id,
          idempotencyKey: `learning-nudge-preference:${randomUUID()}`,
          metadata: {
            action: input.action,
            ...(input.action === 'PAUSE' ? { pauseUntil: input.pauseUntil!.toISOString() } : {}),
          },
          actorUserId: s.userId,
          occurredAt: input.now,
        },
      });
      return saved;
    });
  }
}
