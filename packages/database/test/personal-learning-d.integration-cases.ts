import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
} from '@bunshin/capability-training';
import {
  PrismaPersonalLearningPersonaRepository,
  PrismaPersonalLearningSavedExamplesRepository,
  PrismaPersonalLearningTopicRepository,
} from '../src/personal-learning-d';
import { PrismaPersonalLearningRequestRepository } from '../src/personal-learning-request';
import { PrismaPersonalLearningConversationRepository } from '../src/personal-learning-conversation';
import { PrismaPersonalLearningPersistenceRepository } from '../src/personal-learning-persistence';
import { PrismaTrainingPersonalDataExportRepository } from '../src/training-personal-data-export';
import { PrismaTrainingPersonalDataDeletionRepository } from '../src/training-personal-data-deletion';
import { PrismaTrainingRetentionExecutionRepository } from '../src/training-retention-execution';
import { PrismaTrainingRetentionCronRepository } from '../src/training-retention-cron';
import { pilotParticipantHash } from '../src/personal-learning-pilot-seat';
import { cleanupProgramFixtures } from './program-fixture-cleanup';

const now = new Date('2026-10-17T03:00:00Z');

/** Called only inside the live disposable database integration suite. */
export function registerPersonalLearningDIntegrationCases(client: PrismaClient) {
  describe('PR-D-3 reviewed persona access and next-call AI projection', () => {
    const cleanup: Array<() => Promise<void>> = [];
    afterEach(async () => {
      await client.personalLearningLinePush.deleteMany();
      await client.personalLearningLineInbox.deleteMany();
      await client.personalLearningLineQuotaNotice.deleteMany();
      await client.personalLearningSavedExample.deleteMany();
      await client.personalLearningPersonaSuppression.deleteMany();
      await client.personalLearningPersonaItem.deleteMany();
      await client.personalLearningTopic.deleteMany();
      await cleanupProgramFixtures(client);
      for (const remove of cleanup.splice(0).reverse()) await remove();
    });

    async function serviceFixture(
      name: string,
      options: {
        multiTopic?: boolean;
        learningMode?: 'DYNAMIC_V1' | 'FIXED_DEFINITIONS_V1';
        workspaceId?: string;
      } = {},
    ) {
      const multiTopic = options.multiTopic ?? true;
      const owner = await client.user.create({ data: { displayName: `${name} owner` } });
      const user = await client.user.create({ data: { displayName: `${name} learner` } });
      const workspace = options.workspaceId
        ? await client.workspace.findUniqueOrThrow({ where: { id: options.workspaceId } })
        : await client.workspace.create({
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
            trainingOperations: {
              notificationsEnabled: false,
              postponedReminderEnabled: false,
            },
            personalLearningPilot: {
              enabled: true,
              enrollmentIds: [enrollmentId],
              participantControl: {
                version: 'PILOT_PARTICIPANT_CAP_V1',
                revision: 1,
                externalParticipantCap: 5,
                internalParticipantCap: 0,
                currentWave: 1,
                currentWaveCap: 5,
              },
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
      await client.personalLearningPilotSeat.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          serviceProgramId: program.id,
          participantHash: pilotParticipantHash(program.id, user.id),
          programEnrollmentId: enrollmentId,
          kind: 'EXTERNAL',
          cohort: 'WAVE_1',
          seatNumber: 1,
        },
      });
      cleanup.push(async () => {
        await client.groupMembership.deleteMany({ where: { groupId: group.id } });
        await client.group.deleteMany({ where: { id: group.id } });
        if (!options.workspaceId)
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

    async function lineConfigurationFixture(f: Awaited<ReturnType<typeof serviceFixture>>) {
      return client.groupLineChannelConfiguration.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          environment: 'DEVELOPMENT',
          version: 1,
          loginChannelId: `login-${randomUUID()}`,
          encryptedLoginSecret: 'integration-encrypted-secret',
          loginSecretMask: '****',
          messagingChannelId: `messaging-${randomUUID()}`,
          encryptedMessagingSecret: 'integration-encrypted-secret',
          messagingSecretMask: '****',
          encryptedAccessToken: 'integration-encrypted-token',
          accessTokenMask: '****',
          createdByUserId: f.owner.id,
        },
        select: { id: true },
      });
    }

    it('keeps rejected inferences rejected and prevents cross-service/workspace/user access', async () => {
      const first = await serviceFixture('PR-D-1 first service');
      const second = await serviceFixture('PR-D-1 other workspace');
      const sameWorkspaceOtherService = await serviceFixture('PR-D-1 other service', {
        workspaceId: first.workspace.id,
      });
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
      const freshProgram = await client.serviceProgram.findUniqueOrThrow({
        where: { id: first.program.id },
        select: { settings: true },
      });
      expect(personalLearningDynamicProgramAllows(freshProgram.settings, first.enrollmentId)).toBe(
        true,
      );
      expect(personalLearningFeatureEnabled(freshProgram.settings, 'multiTopic')).toBe(true);
      expect(await topics.list(first.scope)).not.toBeNull();
      const created = await topics.create(first.scope, { title: 'Private topic' });
      expect(created.outcome).toBe('CREATED');
      if (created.outcome !== 'CREATED') throw new Error('test topic not created');
      expect(await topics.list(sameServiceOtherUser)).toEqual([]);
      expect(await topics.list(second.scope)).toEqual([]);
      expect(await topics.list(sameWorkspaceOtherService.scope)).toEqual([]);
      expect(
        await topics.setStatus(sameServiceOtherUser, created.topic.id, 'COMPLETED'),
      ).toBeNull();
      expect(await topics.setStatus(second.scope, created.topic.id, 'COMPLETED')).toBeNull();
      expect(
        await topics.setStatus(sameWorkspaceOtherService.scope, created.topic.id, 'COMPLETED'),
      ).toBeNull();

      const persona = new PrismaPersonalLearningPersonaRepository(client);
      expect(await persona.list(featureOff.scope)).toEqual([]);
      expect(await persona.list(fixedPath.scope)).toEqual([]);
      expect(
        await persona.setOptIn(first.scope, { enabled: true, consentVersion: 'test-v1' }),
      ).toMatchObject({ profile: { optedIn: true } });
      expect(
        await persona.saveLearnerProfile(first.scope, {
          companyName: 'Example Works',
          ageBand: '30代',
          industryJob: '商品企画',
        }),
      ).toMatchObject({ outcome: 'SAVED' });
      expect(
        await persona.saveLearnerProfile(first.scope, {
          companyName: '東京都渋谷区1丁目2番地',
          ageBand: '30代',
          industryJob: null,
        }),
      ).toEqual({ outcome: 'INVALID' });
      expect(
        await persona.saveLearnerProfile(first.scope, {
          companyName: null,
          ageBand: '10代以下',
          industryJob: null,
        }),
      ).toEqual({ outcome: 'INVALID' });
      const disallowedValues: [string, string][] = [
        ['learning_purpose', '私は糖尿病と診断されました'],
        ['learning_purpose', '同僚の田中さんはAIが得意です'],
        ['learning_purpose', '東京都渋谷区1丁目2番地'],
        ['learning_purpose', '090-1234-5678'],
        ['company_name', 'AIを学びたい'],
      ];
      for (const [attributeKey, value] of disallowedValues) {
        expect(
          await persona.save(first.scope, {
            attributeKey,
            value,
            evidenceType: 'LEARNING_REQUEST',
            evidenceId: randomUUID(),
            evidenceCreatedAt: now,
          }),
        ).toMatchObject({ outcome: 'INVALID' });
      }
      expect(await persona.listForAi(first.scope)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            attributeKey: 'company_name',
            epistemicStatus: 'LEARNER_CONFIRMED',
          }),
          expect.objectContaining({
            attributeKey: 'age_band',
            epistemicStatus: 'LEARNER_CONFIRMED',
          }),
          expect.objectContaining({
            attributeKey: 'industry_job',
            epistemicStatus: 'LEARNER_CONFIRMED',
          }),
        ]),
      );
      expect(await persona.profile(sameServiceOtherUser)).toBeNull();
      expect(await persona.profile(sameWorkspaceOtherService.scope)).toBeNull();
      expect(await persona.profile(second.scope)).toBeNull();
      expect(await persona.setOptIn(first.scope, { enabled: false })).toMatchObject({
        profile: { optedIn: false },
      });
      expect(await persona.listForAi(first.scope)).toEqual([]);
      expect(
        await persona.setOptIn(first.scope, { enabled: true, consentVersion: 'test-v1' }),
      ).toMatchObject({ profile: { optedIn: true } });
      const evidenceId = randomUUID();
      const rejected = await client.personalLearningPersonaItem.create({
        data: {
          workspaceId: first.scope.workspaceId,
          groupId: first.scope.groupId,
          groupMembershipId: first.scope.groupMembershipId,
          userId: first.scope.userId,
          attributeKey: 'explanation_style',
          value: 'visual examples',
          status: 'REJECTED',
          evidenceType: 'LEARNING_REQUEST',
          evidenceId,
          evidenceCreatedAt: now,
        },
      });
      const saveRejected = await persona.save(first.scope, {
        attributeKey: 'explanation_style',
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
      expect(await persona.list(sameWorkspaceOtherService.scope)).toEqual([]);
      expect(
        await persona.review(sameServiceOtherUser, rejected.id, { status: 'CONFIRMED' }),
      ).toMatchObject({
        outcome: 'NOT_FOUND',
      });
      expect(
        await persona.review(second.scope, rejected.id, { status: 'CONFIRMED' }),
      ).toMatchObject({ outcome: 'NOT_FOUND' });
      expect(await persona.delete(second.scope, rejected.id)).toBe(false);
      expect(await persona.delete(sameWorkspaceOtherService.scope, rejected.id)).toBe(false);
      await client.personalLearningPersonaItem.createMany({
        data: ['learning_purpose', 'ai_tool_familiarity', 'learning_pace'].map(
          (attributeKey, index) => ({
            workspaceId: first.scope.workspaceId,
            groupId: first.scope.groupId,
            groupMembershipId: first.scope.groupMembershipId,
            userId: first.scope.userId,
            attributeKey,
            value: `Inference ${index}`,
            status: 'UNCONFIRMED' as const,
            evidenceType: 'LEARNING_REQUEST' as const,
            evidenceId: randomUUID(),
            evidenceCreatedAt: now,
            updatedAt: new Date(now.getTime() + index * 1_000),
          }),
        ),
      });
      const confirmed = await client.personalLearningPersonaItem.createMany({
        data: ['stated_goal'].map((attributeKey, index) => ({
          workspaceId: first.scope.workspaceId,
          groupId: first.scope.groupId,
          groupMembershipId: first.scope.groupMembershipId,
          userId: first.scope.userId,
          attributeKey,
          value: `Confirmed ${index}`,
          status: 'CONFIRMED' as const,
          evidenceType: 'LEARNING_REQUEST' as const,
          evidenceId: randomUUID(),
          evidenceCreatedAt: now,
          updatedAt: new Date(now.getTime() + 100_000 + index * 1_000),
        })),
      });
      expect(confirmed.count).toBe(1);
      for (const [attributeKey, value] of [
        ['learning_purpose', '毎日がんばりたい'],
        ['ai_tool_familiarity', '取引先への提案資料を作りたい'],
      ] as const) {
        expect(
          await persona.save(first.scope, {
            attributeKey,
            value,
            evidenceType: 'LEARNING_REQUEST',
            evidenceId: randomUUID(),
            evidenceCreatedAt: now,
          }),
        ).toMatchObject({ outcome: 'SAVED' });
      }
      const aiIntake = await persona.listForAi(first.scope);
      expect(aiIntake.length).toBeLessThanOrEqual(20);
      expect(aiIntake).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ attributeKey: 'learning_purpose', value: '毎日がんばりたい' }),
          expect.objectContaining({
            attributeKey: 'ai_tool_familiarity',
            value: '取引先への提案資料を作りたい',
          }),
        ]),
      );
      expect(aiIntake.some((item) => item.attributeKey === 'explanation_style')).toBe(false);
      expect(aiIntake[0]?.attributeKey).toBe('company_name');

      const rejectedNext = await client.personalLearningPersonaItem.findUniqueOrThrow({
        where: {
          workspaceId_groupId_groupMembershipId_attributeKey: {
            workspaceId: first.scope.workspaceId,
            groupId: first.scope.groupId,
            groupMembershipId: first.scope.groupMembershipId,
            attributeKey: 'learning_purpose',
          },
        },
      });
      await persona.review(first.scope, rejectedNext.id, { status: 'REJECTED' });
      expect(await persona.listForAi(first.scope)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'learning_purpose' })]),
      );

      const deletedNext = await client.personalLearningPersonaItem.findUniqueOrThrow({
        where: {
          workspaceId_groupId_groupMembershipId_attributeKey: {
            workspaceId: first.scope.workspaceId,
            groupId: first.scope.groupId,
            groupMembershipId: first.scope.groupMembershipId,
            attributeKey: 'ai_tool_familiarity',
          },
        },
      });
      expect(await persona.delete(first.scope, deletedNext.id)).toBe(true);
      expect(
        await client.personalLearningPersonaItem.findUnique({ where: { id: deletedNext.id } }),
      ).toBeNull();
      expect(
        await client.personalLearningPersonaSuppression.findUnique({
          where: {
            workspaceId_groupId_groupMembershipId_attributeKey: {
              workspaceId: first.scope.workspaceId,
              groupId: first.scope.groupId,
              groupMembershipId: first.scope.groupMembershipId,
              attributeKey: 'ai_tool_familiarity',
            },
          },
        }),
      ).toMatchObject({
        workspaceId: first.scope.workspaceId,
        groupId: first.scope.groupId,
        groupMembershipId: first.scope.groupMembershipId,
        userId: first.scope.userId,
        attributeKey: 'ai_tool_familiarity',
      });
      const deletedRetry = await persona.save(first.scope, {
        attributeKey: 'ai_tool_familiarity',
        value: 'should not be persisted after deletion',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      expect(deletedRetry).toEqual({ outcome: 'SUPPRESSED' });
      expect(await persona.listForAi(first.scope)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'ai_tool_familiarity' })]),
      );
      expect(await persona.listSuppressedAttributes(first.scope)).toContain('ai_tool_familiarity');
      expect(await persona.listSuppressedAttributes(sameServiceOtherUser)).not.toContain(
        'ai_tool_familiarity',
      );
      expect(await persona.listSuppressedAttributes(sameWorkspaceOtherService.scope)).not.toContain(
        'ai_tool_familiarity',
      );
      expect(await persona.allowReinference(sameServiceOtherUser, 'ai_tool_familiarity')).toBe(
        false,
      );
      expect(
        await persona.allowReinference(sameWorkspaceOtherService.scope, 'ai_tool_familiarity'),
      ).toBe(false);
      expect(await persona.allowReinference(first.scope, 'ai_tool_familiarity')).toBe(true);
      expect(await persona.listSuppressedAttributes(first.scope)).not.toContain(
        'ai_tool_familiarity',
      );
      const allowedRetry = await persona.save(first.scope, {
        attributeKey: 'ai_tool_familiarity',
        value: 're-created only after learner permission',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      expect(allowedRetry.outcome).toBe('SAVED');
      expect(await persona.listForAi(first.scope)).toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'ai_tool_familiarity' })]),
      );

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
      expect(await examples.list(sameWorkspaceOtherService.scope)).toEqual([]);
      expect(await examples.delete(sameServiceOtherUser, saved.item.id)).toBe(false);
      expect(await examples.delete(second.scope, saved.item.id)).toBe(false);
      expect(await examples.delete(sameWorkspaceOtherService.scope, saved.item.id)).toBe(false);
      expect(await examples.list(first.scope)).toHaveLength(1);
    });

    it('allows opted-in persona use on dynamic single-topic programs with multiTopic OFF', async () => {
      const f = await serviceFixture('PR-D-3b single topic without multiTopic', {
        multiTopic: false,
      });
      const persona = new PrismaPersonalLearningPersonaRepository(client);
      expect(
        await persona.setOptIn(f.scope, { enabled: true, consentVersion: 'test-v1' }),
      ).toMatchObject({ profile: { optedIn: true } });
      expect(
        await persona.save(f.scope, {
          attributeKey: 'learning_purpose',
          value: '業務でAIを活用したい',
          evidenceType: 'CONVERSATION_EVENT',
          evidenceId: randomUUID(),
          evidenceCreatedAt: now,
        }),
      ).toMatchObject({ outcome: 'SAVED' });
      expect(await persona.listForAi(f.scope)).toEqual(
        expect.arrayContaining([expect.objectContaining({ attributeKey: 'learning_purpose' })]),
      );
    });

    it('exports and learner-deletes topic, persona, suppression, and saved-example data', async () => {
      const f = await serviceFixture('PR-D-4 export and delete');
      const topic = await new PrismaPersonalLearningTopicRepository(client).create(f.scope, {
        title: '本人の学習テーマ',
      });
      if (topic.outcome !== 'CREATED') throw new Error('topic fixture creation failed');
      const persona = new PrismaPersonalLearningPersonaRepository(client);
      await persona.setOptIn(f.scope, { enabled: true, consentVersion: 'test-v1' });
      await persona.saveLearnerProfile(f.scope, {
        companyName: 'Example Works',
        ageBand: '30代',
        industryJob: '商品企画',
      });
      const inferred = await persona.save(f.scope, {
        attributeKey: 'explanation_style',
        value: '短い例で学びたい',
        evidenceType: 'LEARNING_REQUEST',
        evidenceId: randomUUID(),
        evidenceCreatedAt: now,
      });
      if (inferred.outcome !== 'SAVED' || !inferred.item)
        throw new Error('persona fixture creation failed');
      expect(await persona.delete(f.scope, inferred.item.id)).toBe(true);
      const example = await new PrismaPersonalLearningSavedExamplesRepository(client).save(
        f.scope,
        {
          title: '使い回せる手本',
          content: '自分で保存した例文',
          sourceType: 'LEARNER_AUTHORED',
          sourceId: randomUUID(),
        },
      );
      if (example.outcome !== 'SAVED') throw new Error('saved example fixture creation failed');
      const configuration = await lineConfigurationFixture(f);
      const configurationId = configuration.id;
      const textEventId = `line-text-${randomUUID()}`;
      const imageEventId = `line-image-${randomUUID()}`;
      await client.personalLearningLineInbox.createMany({
        data: [
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: textEventId,
            messageType: 'TEXT',
            text: 'LINEで送った学習相談',
            createdAt: now,
          },
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: imageEventId,
            messageType: 'IMAGE',
            lineMessageId: `image-${randomUUID()}`,
            imageMimeType: 'image/jpeg',
            imageSha256: 'a'.repeat(64),
            imageSizeBytes: 3,
            imageBytes: new Uint8Array([1, 2, 3]),
            createdAt: now,
          },
        ],
      });
      await client.personalLearningLinePush.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId,
          providerEventId: textEventId,
          retryKey: randomUUID(),
          text: 'Web画面で続けられます',
        },
      });
      const scope = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.scope.programEnrollmentId,
        actorUserId: f.scope.userId,
      };
      const exported = await new PrismaTrainingPersonalDataExportRepository(client).read(scope);
      expect(exported.outcome).toBe('FOUND');
      if (exported.outcome !== 'FOUND') throw new Error('personal export missing');
      expect(exported.data.dynamicLearning).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'TOPIC', title: '本人の学習テーマ' }),
          expect.objectContaining({ kind: 'PERSONA_REINFERENCE_SUPPRESSION' }),
          expect.objectContaining({
            kind: 'PERSONA_PROFILE',
            optedIn: true,
            companyName: 'Example Works',
          }),
          expect.objectContaining({ kind: 'SAVED_EXAMPLE', content: '自分で保存した例文' }),
        ]),
      );
      expect(exported.data.personalLearning).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'LINE_INBOUND', text: 'LINEで送った学習相談' }),
          expect.objectContaining({
            kind: 'LINE_INBOUND',
            messageType: 'IMAGE',
            imageBase64: 'AQID',
          }),
          expect.objectContaining({ kind: 'LINE_OUTBOUND', text: 'Web画面で続けられます' }),
        ]),
      );

      const deletion = new PrismaTrainingPersonalDataDeletionRepository(client);
      const preview = await deletion.preview({ ...scope, target: { kind: 'ALL' } });
      if (preview.outcome !== 'PREVIEW') throw new Error('deletion preview missing');
      expect(preview.preview.counts.dynamicLearningData).toBe(6);
      expect(
        await deletion.delete({
          ...scope,
          target: { kind: 'ALL' },
          revision: preview.preview.revision,
          now,
        }),
      ).toMatchObject({ outcome: 'DELETED' });
      expect(await client.personalLearningTopic.count({ where: { groupId: f.group.id } })).toBe(0);
      expect(
        await client.personalLearningPersonaItem.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(
        await client.personalLearningPersonaSuppression.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(
        await client.personalLearningSavedExample.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(
        await client.personalLearningPersonaProfile.count({ where: { groupId: f.group.id } }),
      ).toBe(0);
      expect(await client.personalLearningLineInbox.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
      expect(await client.personalLearningLinePush.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
    });

    it('deduplicates each LINE event and rejects cross-workspace inbox ownership', async () => {
      const first = await serviceFixture('PR-F LINE scope first');
      const otherWorkspace = await serviceFixture('PR-F LINE scope other');
      const configuration = await lineConfigurationFixture(first);
      const providerEventId = `line-event-${randomUUID()}`;
      const row = {
        workspaceId: first.scope.workspaceId,
        groupId: first.scope.groupId,
        programEnrollmentId: first.scope.programEnrollmentId,
        groupMembershipId: first.scope.groupMembershipId,
        userId: first.scope.userId,
        configurationId: configuration.id,
        providerEventId,
        messageType: 'TEXT',
        text: 'スコープ検査用本文',
      };
      await client.personalLearningLineInbox.create({ data: row });
      await expect(client.personalLearningLineInbox.create({ data: row })).rejects.toMatchObject({
        code: 'P2002',
      });
      await expect(
        client.personalLearningLineInbox.create({
          data: {
            ...row,
            workspaceId: otherWorkspace.scope.workspaceId,
            groupId: otherWorkspace.scope.groupId,
            programEnrollmentId: otherWorkspace.scope.programEnrollmentId,
            groupMembershipId: otherWorkspace.scope.groupMembershipId,
            userId: otherWorkspace.scope.userId,
            providerEventId: `cross-scope-${randomUUID()}`,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('retention expires LINE text at the enrollment deadline and images independently', async () => {
      const f = await serviceFixture('PR-F retention', { multiTopic: false });
      await client.platformAdmin.create({
        data: { userId: f.owner.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      cleanup.push(async () => {
        await client.platformAdmin.deleteMany({ where: { userId: f.owner.id } });
      });
      const endedAt = new Date(now.getTime() - 91 * 86_400_000);
      const startsAt = new Date(endedAt.getTime() - 30 * 86_400_000);
      await client.programEnrollment.update({
        where: { id: f.enrollmentId },
        data: { status: 'COMPLETED', startsAt, endsAt: endedAt },
      });
      await client.trainingDataRetentionState.upsert({
        where: { programEnrollmentId: f.enrollmentId },
        create: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          endedAt,
        },
        update: { endedAt },
      });
      const configuration = await lineConfigurationFixture(f);
      const configurationId = configuration.id;
      const textEventId = `line-text-${randomUUID()}`;
      const imageEventId = `line-image-${randomUUID()}`;
      await client.personalLearningLineInbox.createMany({
        data: [
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: textEventId,
            messageType: 'TEXT',
            text: '期限後に削除する本文',
            createdAt: startsAt,
          },
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            programEnrollmentId: f.scope.programEnrollmentId,
            groupMembershipId: f.scope.groupMembershipId,
            userId: f.scope.userId,
            configurationId,
            providerEventId: imageEventId,
            messageType: 'IMAGE',
            lineMessageId: `image-${randomUUID()}`,
            imageMimeType: 'image/jpeg',
            imageSha256: 'b'.repeat(64),
            imageSizeBytes: 3,
            imageBytes: new Uint8Array([4, 5, 6]),
            createdAt: new Date(now.getTime() - 91 * 86_400_000),
          },
        ],
      });
      await client.personalLearningLinePush.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.scope.programEnrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId,
          providerEventId: textEventId,
          retryKey: randomUUID(),
          text: '本文への回答',
        },
      });
      const retention = new PrismaTrainingRetentionExecutionRepository(client);
      const input = {
        workspaceId: f.scope.workspaceId,
        groupId: f.scope.groupId,
        programEnrollmentId: f.scope.programEnrollmentId,
        operatorUserId: f.owner.id,
        now,
      };
      const preview = await retention.preview(input);
      if (preview.outcome !== 'PREVIEW') throw new Error('retention preview missing');
      expect(preview.preview.counts.lineMessages).toBe(2);
      expect(
        await retention.execute({ ...input, revision: preview.preview.revision }),
      ).toMatchObject({
        outcome: 'APPLIED',
        counts: { lineMessages: 2 },
      });
      expect(await client.personalLearningLineInbox.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
      expect(await client.personalLearningLinePush.count({ where: { groupId: f.group.id } })).toBe(
        0,
      );
    });

    it('cron retention is preview-only by default and deletes only due rows inside the configured Program', async () => {
      const f = await serviceFixture('PR-F cron retention target', { multiTopic: false });
      const other = await serviceFixture('PR-F cron retention other Program', {
        multiTopic: false,
        workspaceId: f.workspace.id,
      });
      await client.platformAdmin.create({
        data: { userId: f.owner.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      cleanup.push(async () => {
        await client.platformAdmin.deleteMany({ where: { userId: f.owner.id } });
      });
      const firstConfig = await lineConfigurationFixture(f);
      const otherConfig = await lineConfigurationFixture(other);
      const oldImage = `old-${randomUUID()}`;
      const recentImage = `recent-${randomUUID()}`;
      const otherImage = `other-${randomUUID()}`;
      const imageRows = [
        {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId: firstConfig.id,
          providerEventId: oldImage,
          messageType: 'IMAGE' as const,
          lineMessageId: `line-${oldImage}`,
          imageMimeType: 'image/jpeg',
          imageSha256: 'a'.repeat(64),
          imageSizeBytes: 1,
          imageBytes: new Uint8Array([1]),
          createdAt: new Date(now.getTime() - 91 * 86_400_000),
        },
        {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId: firstConfig.id,
          providerEventId: recentImage,
          messageType: 'IMAGE' as const,
          lineMessageId: `line-${recentImage}`,
          imageMimeType: 'image/jpeg',
          imageSha256: 'c'.repeat(64),
          imageSizeBytes: 1,
          imageBytes: new Uint8Array([2]),
          createdAt: new Date(now.getTime() - 10 * 86_400_000),
        },
        {
          workspaceId: other.scope.workspaceId,
          groupId: other.scope.groupId,
          programEnrollmentId: other.enrollmentId,
          groupMembershipId: other.scope.groupMembershipId,
          userId: other.scope.userId,
          configurationId: otherConfig.id,
          providerEventId: otherImage,
          messageType: 'IMAGE' as const,
          lineMessageId: `line-${otherImage}`,
          imageMimeType: 'image/jpeg',
          imageSha256: 'd'.repeat(64),
          imageSizeBytes: 1,
          imageBytes: new Uint8Array([3]),
          createdAt: new Date(now.getTime() - 91 * 86_400_000),
        },
      ];
      await client.personalLearningLineInbox.createMany({ data: imageRows });
      await client.personalLearningLineInbox.create({
        data: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          programEnrollmentId: f.enrollmentId,
          groupMembershipId: f.scope.groupMembershipId,
          userId: f.scope.userId,
          configurationId: firstConfig.id,
          providerEventId: `text-${randomUUID()}`,
          messageType: 'TEXT',
          text: '保持対象の本文',
          createdAt: now,
        },
      });

      const runner = new PrismaTrainingRetentionCronRepository(client);
      const input = {
        scopes: [
          {
            workspaceId: f.scope.workspaceId,
            groupId: f.scope.groupId,
            serviceProgramId: f.program.id,
          },
        ],
        operatorUserId: f.owner.id,
        now,
      };
      expect(await runner.run({ ...input, executeEnabled: false })).toMatchObject({
        outcome: 'PREVIEW',
        counts: { practiceSupportImages: 0, lineMessages: 1 },
      });
      expect(await client.personalLearningLineInbox.count()).toBe(4);

      expect(await runner.run({ ...input, executeEnabled: true })).toMatchObject({
        outcome: 'APPLIED',
        counts: { practiceSupportImages: 0, lineMessages: 1 },
      });
      expect(
        await client.personalLearningLineInbox.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: firstConfig.id,
              providerEventId: oldImage,
            },
          },
        }),
      ).toBeNull();
      expect(
        await client.personalLearningLineInbox.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: firstConfig.id,
              providerEventId: recentImage,
            },
          },
        }),
      ).not.toBeNull();
      expect(
        await client.personalLearningLineInbox.findUnique({
          where: {
            configurationId_providerEventId: {
              configurationId: otherConfig.id,
              providerEventId: otherImage,
            },
          },
        }),
      ).not.toBeNull();
      expect(await runner.run({ ...input, executeEnabled: true })).toMatchObject({
        outcome: 'APPLIED',
        counts: { lineMessages: 0 },
      });
      expect(await client.personalLearningLineInbox.count()).toBe(3);
      expect(await client.personalLearningLineInbox.count({ where: { messageType: 'TEXT' } })).toBe(
        1,
      );
      const audit = await client.programAuditLog.findFirst({
        where: {
          workspaceId: f.scope.workspaceId,
          groupId: f.scope.groupId,
          resourceId: f.enrollmentId,
          action: 'TRAINING_RETENTION_APPLIED',
        },
        orderBy: { performedAt: 'desc' },
      });
      expect(audit?.afterData).toMatchObject({
        executionSource: 'CRON',
        serviceProgramId: f.program.id,
      });
      expect(JSON.stringify(audit?.afterData)).not.toContain('保持対象の本文');
    });

    it('keeps each wish and conversation on its selected topic and rejects a cross-topic update', async () => {
      const fixture = await serviceFixture('PR-D-2 topic separation');
      const topicRepository = new PrismaPersonalLearningTopicRepository(client);
      const first = await topicRepository.create(fixture.scope, { title: '一つ目のテーマ' });
      const second = await topicRepository.create(fixture.scope, { title: '二つ目のテーマ' });
      if (first.outcome !== 'CREATED' || second.outcome !== 'CREATED')
        throw new Error('topic fixture creation failed');
      const requests = new PrismaPersonalLearningRequestRepository(client);
      const conversations = new PrismaPersonalLearningConversationRepository(client);
      const firstActor = {
        scope: fixture.scope,
        actorUserId: fixture.user.id,
        topicId: first.topic.id,
      };
      const secondActor = {
        scope: fixture.scope,
        actorUserId: fixture.user.id,
        topicId: second.topic.id,
      };
      const sharedIdempotencyKey = 'same-key-in-independent-topics';
      const firstRequest = await requests.saveRequest({
        actorUserId: firstActor.actorUserId,
        scope: firstActor.scope,
        topicId: firstActor.topicId,
        expectedRevision: 0,
        idempotencyKey: sharedIdempotencyKey,
        content: {
          originalText: '一つ目の学習希望',
          deviceType: 'PC',
          toolDescription: '検証ツール',
          experienceDescription: null,
          currentPosition: null,
        },
      });
      const secondRequest = await requests.saveRequest({
        actorUserId: secondActor.actorUserId,
        scope: secondActor.scope,
        topicId: secondActor.topicId,
        expectedRevision: 0,
        idempotencyKey: sharedIdempotencyKey,
        content: {
          originalText: '二つ目の学習希望',
          deviceType: 'PC',
          toolDescription: '検証ツール',
          experienceDescription: null,
          currentPosition: null,
        },
      });
      const firstTurn = {
        actor: firstActor,
        requestId: firstRequest.id,
        requestRevision: firstRequest.revision,
        operationId: randomUUID(),
        text: '一つ目だけの相談',
      };
      const secondTurn = {
        actor: secondActor,
        requestId: secondRequest.id,
        requestRevision: secondRequest.revision,
        operationId: randomUUID(),
        text: '二つ目だけの相談',
      };
      await conversations.prepareTurn(firstTurn);
      await conversations.prepareTurn(secondTurn);
      expect((await requests.readRequest(firstActor))?.originalText).toBe('一つ目の学習希望');
      expect((await requests.readRequest(secondActor))?.originalText).toBe('二つ目の学習希望');
      await expect(
        requests.readRequest({ ...firstActor, topicId: randomUUID() }),
      ).rejects.toThrow();
      expect(
        (await conversations.readConversation(firstActor))?.messages.map((m) => m.text),
      ).toEqual(['一つ目だけの相談']);
      expect(
        (await conversations.readConversation(secondActor))?.messages.map((m) => m.text),
      ).toEqual(['二つ目だけの相談']);
      await expect(
        conversations.prepareTurn({ ...firstTurn, requestId: secondRequest.id }),
      ).rejects.toThrow();
      await expect(
        conversations.setConversationSharing({
          actor: secondActor,
          requestId: firstRequest.id,
          requestRevision: firstRequest.revision,
          operationId: randomUUID(),
          shared: true,
        }),
      ).rejects.toThrow();
      const updatedFirstRequest = await requests.saveRequest({
        actorUserId: firstActor.actorUserId,
        scope: firstActor.scope,
        topicId: firstActor.topicId,
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
        content: {
          originalText: '他テーマではなく一つ目のテーマだけ更新',
          deviceType: 'PC',
          toolDescription: '検証ツール',
          experienceDescription: null,
          currentPosition: null,
        },
      });
      expect(updatedFirstRequest).toMatchObject({
        originalText: '他テーマではなく一つ目のテーマだけ更新',
        revision: 2,
      });
      expect((await requests.readRequest(firstActor))?.originalText).toBe(
        '他テーマではなく一つ目のテーマだけ更新',
      );
      expect((await requests.readRequest(secondActor))?.originalText).toBe('二つ目の学習希望');

      const goals = await Promise.all(
        [
          { actor: firstActor, title: '一つ目の目標', key: 'TOPIC_ONE' },
          { actor: secondActor, title: '二つ目の目標', key: 'TOPIC_TWO' },
        ].map(async ({ actor, title, key }) => {
          const goal = await client.programMemberGoal.create({
            data: {
              workspaceId: fixture.scope.workspaceId,
              groupId: fixture.scope.groupId,
              programEnrollmentId: fixture.scope.programEnrollmentId,
              groupMembershipId: fixture.scope.groupMembershipId,
              topicId: actor.topicId,
              title,
              metricType: 'ACTION',
              targetValue: 1,
              currentValue: 0,
              unit: 'integration',
              startsAt: now,
              createdByUserId: fixture.user.id,
              updatedByUserId: fixture.user.id,
            },
          });
          await client.personalLearningGoalConfirmation.create({
            data: {
              workspaceId: fixture.scope.workspaceId,
              groupId: fixture.scope.groupId,
              programEnrollmentId: fixture.scope.programEnrollmentId,
              groupMembershipId: fixture.scope.groupMembershipId,
              userId: fixture.user.id,
              programMemberGoalId: goal.id,
              topicId: actor.topicId,
              packageKey: 'AI_TRAINING',
              goalKey: key,
              semanticVersion: 'V1',
              consultationRuleVersion: 'V1',
              scopeRuleVersion: 'V1',
              confirmedAt: now,
            },
          });
          const planId = randomUUID();
          await client.personalLearningPlanRevision.create({
            data: {
              ...fixture.scope,
              userId: fixture.user.id,
              topicId: actor.topicId,
              planId,
              revision: 1,
              previousRevision: null,
              revisionReason: 'INITIAL',
              programMemberGoalId: goal.id,
              contractVersion: 'PERSONAL_LEARNING_PLAN_V1',
              ruleVersion: 'V1',
              status: 'DRAFT',
              steps: JSON.parse(
                JSON.stringify(
                  AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((definition) => ({
                    definition: definition.reference,
                    prerequisites: definition.prerequisites,
                    selectionReason: 'GOAL_ALIGNMENT',
                  })),
                ),
              ) as Prisma.InputJsonValue,
              createdAt: now,
              updatedAt: now,
            },
          });
          return { goalId: goal.id, planId };
        }),
      );
      const persistence = new PrismaPersonalLearningPersistenceRepository(client);
      const firstState = await persistence.read(firstActor);
      const secondState = await persistence.read(secondActor);
      expect(firstState.goals.map((item) => item.reference.reference.programMemberGoalId)).toEqual([
        goals[0]!.goalId,
      ]);
      expect(secondState.goals.map((item) => item.reference.reference.programMemberGoalId)).toEqual(
        [goals[1]!.goalId],
      );
      expect(firstState.plans).toHaveLength(1);
      expect(secondState.plans).toHaveLength(1);
      await expect(
        persistence.confirmPlan({
          ...secondActor,
          planId: goals[0]!.planId,
          expectedRevision: 1,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow();
    });
  });
}
