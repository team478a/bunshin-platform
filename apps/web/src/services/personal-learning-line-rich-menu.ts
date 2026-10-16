import 'server-only';
import { createHash } from 'node:crypto';
import type { PersonalLearningActor } from '@bunshin/application';
import { personalLearningFeatureEnabled, personalLearningMode } from '@bunshin/capability-training';
import { ApplicationError } from '@bunshin/shared';
import { createLogger } from '@bunshin/observability';
import { PrismaPersonalLearningPilotRepository, prisma } from '@bunshin/database';
import { getServerEnvironment } from '@bunshin/config';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { renderPersonalLearningLineRichMenu } from '../line/default-rich-menu';
import {
  createPersonalLearningGroupRichMenu,
  deleteGroupRichMenu,
  linkGroupRichMenuToUser,
  uploadPersonalLearningGroupRichMenuImage,
} from '../line/group-rich-menu-provider';

const contentHash = (title: string) => createHash('sha256').update(title, 'utf8').digest('hex');

/** Dynamic Programs use the learner's current confirmed practice, never a fixed Pilot assignment. */
export async function dynamicPersonalLearningPracticeTitle(
  actor: PersonalLearningActor & { programSettings?: unknown },
) {
  const settings = actor.programSettings;
  if (personalLearningMode(settings) !== 'DYNAMIC_V1') return undefined;
  if (!personalLearningFeatureEnabled(settings, 'lineLearning'))
    throw new ApplicationError('NOT_FOUND', 'LINE learning is not enabled');
  const db = await import('@bunshin/database');
  const practice = await new db.PrismaPersonalLearningPracticeRepository(prisma).readPractice(
    actor,
  );
  return practice.current?.candidate.proposal.outcome.trim() || null;
}

export async function personalLearningLineMenuStatus(
  actor: PersonalLearningActor,
  practiceTitle: string | null,
) {
  const connection = await prisma.groupLineConnection.findFirst({
    where: {
      workspaceId: actor.scope.workspaceId,
      groupId: actor.scope.groupId,
      groupMembershipId: actor.scope.groupMembershipId,
      userId: actor.actorUserId,
      status: 'ACTIVE',
      friendshipStatus: 'FOLLOWING',
      groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      configuration: {
        environment: currentLineEnvironment(),
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
        group: {
          status: 'ACTIVE',
          lineRoutingPolicies: {
            some: {
              environment: currentLineEnvironment(),
              mode: 'DEDICATED',
              pilotEnabled: true,
            },
          },
        },
      },
    },
    select: {
      personalLearningRichMenuLinkedAt: true,
      personalLearningRichMenuContentHash: true,
    },
  });
  const linked = connection?.personalLearningRichMenuLinkedAt !== null && connection !== null;
  return {
    available: connection !== null,
    linked,
    needsRefresh:
      connection !== null &&
      practiceTitle !== null &&
      connection.personalLearningRichMenuContentHash !== contentHash(practiceTitle),
  };
}

export async function activatePersonalLearningLineMenu(input: {
  actor: PersonalLearningActor;
  serviceSlug: string;
}) {
  const s = input.actor.scope;
  const environment = currentLineEnvironment();
  const connection = await prisma.groupLineConnection.findFirst({
    where: {
      workspaceId: s.workspaceId,
      groupId: s.groupId,
      groupMembershipId: s.groupMembershipId,
      userId: input.actor.actorUserId,
      status: 'ACTIVE',
      friendshipStatus: 'FOLLOWING',
      groupMembership: { status: 'ACTIVE', consentedAt: { not: null } },
      configuration: {
        environment,
        status: 'ACTIVE',
        globallyPaused: false,
        lastVerifiedAt: { not: null },
        lastErrorCategory: null,
        group: {
          status: 'ACTIVE',
          lineRoutingPolicies: {
            some: { environment, mode: 'DEDICATED', pilotEnabled: true },
          },
        },
      },
    },
    select: {
      id: true,
      configurationId: true,
      providerUserId: true,
      personalLearningRichMenuId: true,
      personalLearningRichMenuPendingId: true,
      personalLearningRichMenuLinkedAt: true,
      personalLearningRichMenuContentHash: true,
      configuration: { select: { encryptedAccessToken: true } },
    },
  });
  if (!connection)
    throw new ApplicationError('CONFLICT', 'active Manaberu LINE connection required');
  const pilot = new PrismaPersonalLearningPilotRepository(prisma);
  const dynamicTitle = await dynamicPersonalLearningPracticeTitle(input.actor);
  let practiceTitle = dynamicTitle;
  if (dynamicTitle === undefined) {
    const readiness = await pilot.readiness(input.actor);
    if (!readiness.profileReady || !readiness.approvalReady)
      throw new ApplicationError('CONFLICT', 'learning setup is not ready');
    const state = await pilot.read({ scope: s, actorUserId: input.actor.actorUserId });
    const current = state.plans.find((row) => row.isCurrent && row.goalActive);
    const assignment = current
      ? await pilot.currentAssignment({
          scope: s,
          actorUserId: input.actor.actorUserId,
          planId: current.plan.planId,
          revision: current.plan.revision,
        })
      : null;
    practiceTitle = assignment?.display?.title.trim() || null;
  }
  if (!practiceTitle) throw new ApplicationError('CONFLICT', 'current practice is required');
  const nextContentHash = contentHash(practiceTitle);
  if (
    connection.personalLearningRichMenuId &&
    connection.personalLearningRichMenuLinkedAt &&
    connection.personalLearningRichMenuContentHash === nextContentHash
  )
    return { linked: true as const };

  const logger = createLogger().child({
    workspaceId: s.workspaceId,
    groupId: s.groupId,
    groupMembershipId: s.groupMembershipId,
    actorUserId: input.actor.actorUserId,
    route: 'personal-learning-line-rich-menu',
  });
  const image = await renderPersonalLearningLineRichMenu(practiceTitle);
  const accessToken = new AesGcmLineSecretCrypto().decrypt(
    connection.configuration.encryptedAccessToken,
  );

  const connectionIdentity = {
    id: connection.id,
    workspaceId: s.workspaceId,
    groupId: s.groupId,
    groupMembershipId: s.groupMembershipId,
    userId: input.actor.actorUserId,
  };
  if (connection.personalLearningRichMenuPendingId) {
    await deleteGroupRichMenu({
      accessToken,
      lineRichMenuId: connection.personalLearningRichMenuPendingId,
    });
    const cleared = await prisma.groupLineConnection.updateMany({
      where: {
        ...connectionIdentity,
        personalLearningRichMenuPendingId: connection.personalLearningRichMenuPendingId,
      },
      data: { personalLearningRichMenuPendingId: null },
    });
    if (cleared.count !== 1)
      throw new ApplicationError('CONFLICT', 'Manaberu pending LINE menu changed');
  }

  const oldLineRichMenuId = connection.personalLearningRichMenuId;
  const lineRichMenuId = await createPersonalLearningGroupRichMenu({
    accessToken,
    groupId: s.groupId,
    serviceSlug: input.serviceSlug,
    enrollmentId: s.programEnrollmentId,
    appUrl: getServerEnvironment().APP_URL,
  });

  const pendingWhere = {
    ...connectionIdentity,
    configurationId: connection.configurationId,
    providerUserId: connection.providerUserId,
    status: 'ACTIVE' as const,
    personalLearningRichMenuPendingId: null,
  };
  let pending = await prisma.groupLineConnection.updateMany({
    where: pendingWhere,
    data: { personalLearningRichMenuPendingId: lineRichMenuId },
  });
  if (pending.count !== 1) {
    // Keep an orphan recoverable even if the connection became inactive during creation.
    pending = await prisma.groupLineConnection.updateMany({
      where: { ...connectionIdentity, personalLearningRichMenuPendingId: null },
      data: { personalLearningRichMenuPendingId: lineRichMenuId },
    });
    if (pending.count !== 1) {
      try {
        await deleteGroupRichMenu({ accessToken, lineRichMenuId });
      } catch (error) {
        logger.error('untracked personal LINE menu cleanup failed', {
          lineRichMenuId,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
      throw new ApplicationError('CONFLICT', 'Manaberu LINE connection changed');
    }
    throw new ApplicationError('CONFLICT', 'Manaberu LINE connection changed');
  }

  await uploadPersonalLearningGroupRichMenuImage({ accessToken, lineRichMenuId, image });
  await linkGroupRichMenuToUser({
    accessToken,
    providerUserId: connection.providerUserId,
    lineRichMenuId,
  });

  const committed = await prisma.groupLineConnection.updateMany({
    where: {
      ...connectionIdentity,
      configurationId: connection.configurationId,
      providerUserId: connection.providerUserId,
      status: 'ACTIVE',
      personalLearningRichMenuPendingId: lineRichMenuId,
    },
    data: {
      personalLearningRichMenuId: lineRichMenuId,
      personalLearningRichMenuPendingId: null,
      personalLearningRichMenuLinkedAt: new Date(),
      personalLearningRichMenuContentHash: nextContentHash,
    },
  });
  if (committed.count !== 1)
    throw new ApplicationError('CONFLICT', 'Manaberu LINE connection changed');

  if (oldLineRichMenuId && oldLineRichMenuId !== lineRichMenuId) {
    try {
      await deleteGroupRichMenu({ accessToken, lineRichMenuId: oldLineRichMenuId });
    } catch (error) {
      logger.error('previous personal LINE menu cleanup failed', {
        lineRichMenuId: oldLineRichMenuId,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  return { linked: true as const };
}
