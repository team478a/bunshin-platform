import 'server-only';
import { createHash } from 'node:crypto';
import type { PersonalLearningActor } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { PrismaPersonalLearningPilotRepository, prisma } from '@bunshin/database';
import { getServerEnvironment } from '@bunshin/config';
import { AesGcmLineSecretCrypto, currentLineEnvironment } from '../line/secure-configuration';
import { renderPersonalLearningLineRichMenu } from '../line/default-rich-menu';
import { activatePersonalLearningGroupRichMenu } from '../line/group-rich-menu-provider';

const contentHash = (title: string) => createHash('sha256').update(title, 'utf8').digest('hex');

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
      personalLearningRichMenuLinkedAt: true,
      personalLearningRichMenuContentHash: true,
      configuration: { select: { encryptedAccessToken: true } },
    },
  });
  if (!connection)
    throw new ApplicationError('CONFLICT', 'active Manaberu LINE connection required');
  const pilot = new PrismaPersonalLearningPilotRepository(prisma);
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
  if (!assignment || !assignment.display.title.trim())
    throw new ApplicationError('CONFLICT', 'current practice is required');
  const nextContentHash = contentHash(assignment.display.title);
  if (
    connection.personalLearningRichMenuId &&
    connection.personalLearningRichMenuLinkedAt &&
    connection.personalLearningRichMenuContentHash === nextContentHash
  )
    return { linked: true as const };

  const image = await renderPersonalLearningLineRichMenu(assignment.display.title);
  const accessToken = new AesGcmLineSecretCrypto().decrypt(
    connection.configuration.encryptedAccessToken,
  );
  const result = await activatePersonalLearningGroupRichMenu({
    accessToken,
    providerUserId: connection.providerUserId,
    groupId: s.groupId,
    serviceSlug: input.serviceSlug,
    enrollmentId: s.programEnrollmentId,
    appUrl: getServerEnvironment().APP_URL,
    image,
    existingLineRichMenuId: connection.personalLearningRichMenuId,
    onCreated: async (lineRichMenuId) => {
      const saved = await prisma.groupLineConnection.updateMany({
        where: {
          id: connection.id,
          workspaceId: s.workspaceId,
          groupId: s.groupId,
          groupMembershipId: s.groupMembershipId,
          userId: input.actor.actorUserId,
          configurationId: connection.configurationId,
          providerUserId: connection.providerUserId,
          status: 'ACTIVE',
        },
        data: { personalLearningRichMenuId: lineRichMenuId },
      });
      if (saved.count !== 1)
        throw new ApplicationError('CONFLICT', 'Manaberu LINE connection changed');
    },
  });
  const linked = await prisma.groupLineConnection.updateMany({
    where: {
      id: connection.id,
      workspaceId: s.workspaceId,
      groupId: s.groupId,
      groupMembershipId: s.groupMembershipId,
      userId: input.actor.actorUserId,
      configurationId: connection.configurationId,
      providerUserId: connection.providerUserId,
      personalLearningRichMenuId: result.lineRichMenuId,
      status: 'ACTIVE',
    },
    data: {
      personalLearningRichMenuLinkedAt: new Date(),
      personalLearningRichMenuContentHash: nextContentHash,
    },
  });
  if (linked.count !== 1)
    throw new ApplicationError('CONFLICT', 'Manaberu LINE connection changed');
  return { linked: true as const };
}
