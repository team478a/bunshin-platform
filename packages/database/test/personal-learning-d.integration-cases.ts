import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PrismaPersonalLearningPersonaRepository,
  PrismaPersonalLearningSavedExamplesRepository,
  PrismaPersonalLearningTopicRepository,
} from '../src/personal-learning-d';
import { cleanupProgramFixtures } from './program-fixture-cleanup';

const now = new Date('2026-10-17T03:00:00Z');

/** Called only inside the live disposable database integration suite. */
export function registerPersonalLearningDIntegrationCases(client: PrismaClient) {
  describe('PR-D-1 tenant boundaries and rejected persona persistence', () => {
    const cleanup: Array<() => Promise<void>> = [];
    afterEach(async () => {
      await client.personalLearningSavedExample.deleteMany();
      await client.personalLearningPersonaItem.deleteMany();
      await client.personalLearningTopic.deleteMany();
      await cleanupProgramFixtures(client);
      for (const remove of cleanup.splice(0).reverse()) await remove();
    });

    async function serviceFixture(
      name: string,
      options: { multiTopic?: boolean; learningMode?: 'DYNAMIC_V1' | 'FIXED_DEFINITIONS_V1' } = {},
    ) {
      const multiTopic = options.multiTopic ?? true;
      const owner = await client.user.create({ data: { displayName: `${name} owner` } });
      const user = await client.user.create({ data: { displayName: `${name} learner` } });
      const workspace = await client.workspace.create({
        data: { type: 'ORGANIZATION', name: `${name}-${randomUUID()}` },
      });
      const group = await client.group.create({ data: { workspaceId: workspace.id, name } });
      await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: owner.id,
          serviceRole: 'SERVICE_OWNER',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      const member = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: user.id,
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      const template = await client.programTemplate.create({
        data: {
          workspaceId: workspace.id,
          ownerGroupId: group.id,
          name,
          description: name,
          category: 'AI_TRAINING',
          targetAudience: 'integration test',
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
          publishedAt: now,
        },
      });
      const program = await client.serviceProgram.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          programTemplateVersionId: version.id,
          displayName: name,
          description: name,
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
      const enrollmentId = randomUUID();
      await client.programEnrollment.create({
        data: {
          id: enrollmentId,
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
          startsAt: now,
        },
      });
      await client.serviceProgram.update({
        where: { id: program.id },
        data: {
          settings: {
            moduleKey: 'AI_TRAINING_V1',
            personalLearningPilot: {
              enabled: true,
              enrollmentIds: [enrollmentId],
              learningMode: options.learningMode ?? 'DYNAMIC_V1',
              learningFeatures: {
                conversation: true,
                multiTopic,
                lineLearning: false,
                extendedScope: false,
              },
            },
          },
        },
      });
      cleanup.push(async () => {
        await client.groupMembership.deleteMany({ where: { groupId: group.id } });
        await client.group.deleteMany({ where: { id: group.id } });
        await client.workspace.deleteMany({ where: { id: workspace.id } });
        await client.user.deleteMany({ where: { id: { in: [owner.id, user.id] } } });
      });
      return {
        owner,
        user,
        workspace,
        group,
        member,
        program,
        offering,
        enrollmentId,
        scope: {
          workspaceId: workspace.id,
          groupId: group.id,
          programEnrollmentId: enrollmentId,
          groupMembershipId: member.id,
          userId: user.id,
        },
      };
    }

    it('keeps rejected inferences rejected and prevents cross-service/workspace/user access', async () => {
      const first = await serviceFixture('PR-D-1 first service');
      const second = await serviceFixture('PR-D-1 other workspace');
      const featureOff = await serviceFixture('PR-D-1 feature off', { multiTopic: false });
      const fixedPath = await serviceFixture('PR-D-1 fixed path', {
        learningMode: 'FIXED_DEFINITIONS_V1',
      });
      const otherUser = await client.user.create({
        data: { displayName: 'PR-D-1 same service other user' },
      });
      const otherMembership = await client.groupMembership.create({
        data: {
          workspaceId: first.workspace.id,
          groupId: first.group.id,
          userId: otherUser.id,
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
          consentedAt: now,
        },
      });
      cleanup.push(async () => {
        await client.groupMembership.deleteMany({ where: { id: otherMembership.id } });
        await client.user.deleteMany({ where: { id: otherUser.id } });
      });
      const otherEnrollmentId = randomUUID();
      await client.programEnrollment.create({
        data: {
          id: otherEnrollmentId,
          workspaceId: first.workspace.id,
          groupId: first.group.id,
          groupMembershipId: otherMembership.id,
          serviceProgramId: first.program.id,
          programOfferingId: first.offering.id,
          status: 'ACTIVE',
          supportMode: 'GUIDED',
          goalSnapshot: {},
          offeringSnapshot: {},
          invitedByUserId: first.owner.id,
          startsAt: now,
        },
      });
      const currentProgram = await client.serviceProgram.findUnique({
        where: { id: first.program.id },
        select: { settings: true },
      });
      if (!currentProgram) throw new Error('integration test program disappeared');
      const currentSettings = currentProgram.settings as Record<string, unknown>;
      const pilot = currentSettings.personalLearningPilot as Record<string, unknown>;
      await client.serviceProgram.update({
        where: { id: first.program.id },
        data: {
          settings: {
            ...currentSettings,
            personalLearningPilot: {
              ...pilot,
              enrollmentIds: [first.enrollmentId, otherEnrollmentId],
            },
          },
        },
      });
      const sameServiceOtherUser = {
        ...first.scope,
        programEnrollmentId: otherEnrollmentId,
        groupMembershipId: otherMembership.id,
        userId: otherUser.id,
      };

      const topics = new PrismaPersonalLearningTopicRepository(client);
      expect(await topics.list(featureOff.scope)).toBeNull();
      expect(await topics.create(featureOff.scope, { title: 'Must not be stored' })).toMatchObject({
        outcome: 'NOT_FOUND',
      });
      expect(await topics.list(fixedPath.scope)).toBeNull();
      expect(await topics.create(fixedPath.scope, { title: 'Must not be stored' })).toMatchObject({
        outcome: 'NOT_FOUND',
      });
      const created = await topics.create(first.scope, { title: 'Private topic' });
      expect(created.outcome).toBe('CREATED');
      if (created.outcome !== 'CREATED') throw new Error('test topic not created');
      expect(await topics.list(sameServiceOtherUser)).toEqual([]);
      expect(await topics.list(second.scope)).toEqual([]);
      expect(
        await topics.setStatus(sameServiceOtherUser, created.topic.id, 'COMPLETED'),
      ).toBeNull();

      const persona = new PrismaPersonalLearningPersonaRepository(client);
      expect(await persona.list(featureOff.scope)).toEqual([]);
      expect(await persona.list(fixedPath.scope)).toEqual([]);
      const evidenceId = randomUUID();
      const rejected = await client.personalLearningPersonaItem.create({
        data: {
          workspaceId: first.scope.workspaceId,
          groupId: first.scope.groupId,
          groupMembershipId: first.scope.groupMembershipId,
          userId: first.scope.userId,
          attributeKey: 'preferred_learning_style',
          value: 'visual examples',
          status: 'REJECTED',
          evidenceType: 'LEARNING_REQUEST',
          evidenceId,
          evidenceCreatedAt: now,
        },
      });
      const saveRejected = await persona.save(first.scope, {
        attributeKey: 'preferred_learning_style',
        value: 'visual examples inferred again',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      expect(saveRejected.outcome).toBe('REJECTED');
      expect(
        await client.personalLearningPersonaItem.findUnique({ where: { id: rejected.id } }),
      ).toMatchObject({
        status: 'REJECTED',
        value: 'visual examples',
        evidenceId,
      });
      expect(await persona.list(sameServiceOtherUser)).toEqual([]);
      expect(await persona.list(second.scope)).toEqual([]);
      expect(
        await persona.review(sameServiceOtherUser, rejected.id, { status: 'CONFIRMED' }),
      ).toMatchObject({
        outcome: 'NOT_FOUND',
      });
      await client.personalLearningPersonaItem.createMany({
        data: Array.from({ length: 25 }, (_, index) => ({
          workspaceId: first.scope.workspaceId,
          groupId: first.scope.groupId,
          groupMembershipId: first.scope.groupMembershipId,
          userId: first.scope.userId,
          attributeKey: `inference_${index}`,
          value: `Inference ${index}`,
          status: 'UNCONFIRMED' as const,
          evidenceType: 'LEARNING_REQUEST' as const,
          evidenceId: randomUUID(),
          evidenceCreatedAt: now,
        })),
      });
      const aiIntake = await persona.listForAi(first.scope);
      expect(aiIntake).toHaveLength(20);
      expect(aiIntake.some((item) => item.attributeKey === 'preferred_learning_style')).toBe(false);

      const examples = new PrismaPersonalLearningSavedExamplesRepository(client);
      expect(await examples.list(featureOff.scope)).toEqual([]);
      expect(await examples.list(fixedPath.scope)).toEqual([]);
      const saved = await examples.save(first.scope, {
        title: 'Private example',
        content: 'Only the owning learner can read this.',
        sourceType: 'PRACTICE_ANSWER',
        sourceId: randomUUID(),
      });
      expect(saved.outcome).toBe('SAVED');
      if (saved.outcome !== 'SAVED') throw new Error('test example not saved');
      expect(await examples.list(sameServiceOtherUser)).toEqual([]);
      expect(await examples.list(second.scope)).toEqual([]);
      expect(await examples.delete(sameServiceOtherUser, saved.item.id)).toBe(false);
      expect(await examples.list(first.scope)).toHaveLength(1);
    });
  });
}
