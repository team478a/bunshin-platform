import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PrismaTrainingProgressImprovementAdapter } from '../src/service-improvement-progress';
import { cleanupProgramFixtures } from './program-fixture-cleanup';

/** Registered only inside the existing disposable DB preflight suite. Synthetic data only. */
export function registerServiceImprovementProgressIntegrationCases(client: PrismaClient) {
  describe('training progress observation isolated PostgreSQL contract', () => {
    afterEach(() => cleanupProgramFixtures(client));
    it('executes the scoped state-only SQL and rechecks revoked administrator access', async () => {
      const at = new Date('2026-09-03Z');
      const owner = await client.user.create({ data: { displayName: 'Synthetic overview owner' } });
      const participant = await client.user.create({
        data: { displayName: 'Synthetic overview learner' },
      });
      const workspace = await client.workspace.create({
        data: { type: 'ORGANIZATION', name: 'Synthetic overview' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic overview' },
      });
      const admin = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: owner.id,
          status: 'ACTIVE',
          consentedAt: at,
          serviceRole: 'SERVICE_OWNER',
        },
      });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: participant.id,
          status: 'ACTIVE',
          consentedAt: at,
          serviceRole: 'PARTICIPANT',
        },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `overview-${randomUUID()}`,
          displayName: 'Synthetic',
          description: 'Synthetic',
          operatorName: 'Synthetic',
          createdByUserId: owner.id,
          updatedByUserId: owner.id,
        },
      });
      const template = await client.programTemplate.create({
        data: {
          workspaceId: workspace.id,
          ownerGroupId: group.id,
          name: 'Synthetic',
          description: 'Synthetic',
          category: 'AI_TRAINING',
          targetAudience: 'Synthetic',
          status: 'ACTIVE',
          visibility: 'PRIVATE',
          createdByUserId: owner.id,
        },
      });
      const version = await client.programTemplateVersion.create({
        data: {
          workspaceId: workspace.id,
          programTemplateId: template.id,
          version: 1,
          status: 'PUBLISHED',
          definition: {},
          createdByUserId: owner.id,
          publishedAt: at,
        },
      });
      const program = await client.serviceProgram.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          programTemplateVersionId: version.id,
          displayName: 'Synthetic',
          description: 'Synthetic',
          status: 'ACTIVE',
          settings: { moduleKey: 'AI_TRAINING_V1' },
          createdByUserId: owner.id,
        },
      });
      const offering = await client.programOffering.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          serviceProgramId: program.id,
          version: 1,
          status: 'ACTIVE',
          seller: 'SERVICE',
          priceOwner: 'SERVICE',
          paymentOwner: 'SERVICE',
          apiCostOwner: 'PLATFORM',
          supportOwner: 'SERVICE',
          contentOwner: 'SERVICE',
          characterOwner: 'SERVICE',
          termsSnapshot: {},
          createdByUserId: owner.id,
        },
      });
      const enrollment = await client.programEnrollment.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          groupMembershipId: member.id,
          serviceProgramId: program.id,
          programOfferingId: offering.id,
          status: 'ACTIVE',
          supportMode: 'GUIDED',
          goalSnapshot: {},
          offeringSnapshot: {},
          invitedByUserId: owner.id,
        },
      });
      const assignment = await client.programMissionAssignment.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          programEnrollmentId: enrollment.id,
          programTemplateVersionId: version.id,
          sequence: 1,
          routeKey: 'SYNTHETIC',
          phaseKey: 'SYNTHETIC',
          missionDefinitionKey: 'SYNTHETIC',
          displaySnapshot: { private: 'DO_NOT_EXPORT' },
          ruleVersion: 'SYNTHETIC',
          status: 'COMPLETED',
          presentedAt: at,
          startedAt: at,
          completedAt: at,
          updatedAt: at,
        },
      });
      expect(assignment.status).toBe('COMPLETED');
      expect(assignment.completedAt).toEqual(at);
      await client.trainingMissionAnswer.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          programEnrollmentId: enrollment.id,
          missionAssignmentId: assignment.id,
          userId: participant.id,
          answer: 'DO_NOT_EXPORT',
          evaluation: { private: 'DO_NOT_EXPORT' },
          evaluationStatus: 'READY',
          evaluatedAt: at,
          createdAt: at,
          updatedAt: at,
        },
      });
      const scope = {
        tenantRef: workspace.id,
        workspaceId: workspace.id,
        serviceId: group.id,
        packageKey: 'TRAINING',
        adapterKey: 'TRAINING_PROGRESS',
        environment: 'DEVELOPMENT' as const,
      };
      const reader = new PrismaTrainingProgressImprovementAdapter(client, scope);
      const request = {
        actorUserId: owner.id,
        scope,
        fromInclusive: new Date('2026-09-01Z'),
        toExclusive: new Date('2026-10-01Z'),
        subject: null,
        limit: 10,
      };
      const result = await reader.readObservations(request);
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0]?.metadata).toEqual({
        started: true,
        completed: true,
        submitted: true,
        evaluationReady: true,
        evaluationFailed: false,
        uncertain: false,
      });
      expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPORT');
      expect(
        (
          await reader.readObservations({
            ...request,
            subject: { userRef: owner.id, bunshinRef: null },
          })
        ).observations,
      ).toHaveLength(0);
      await client.groupMembership.update({
        where: { id: admin.id },
        data: { status: 'SUSPENDED' },
      });
      await expect(reader.readObservations(request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
}
